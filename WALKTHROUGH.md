# Walkthrough: how the core algorithms work

This file explains the four main algorithms in plain language, with numbers, so you
can explain them to anyone. Each section ends with questions you should be able to
answer. Code references are `file:function`.

---

## 0. The raw material: blendshapes

MediaPipe Face Landmarker looks at each camera frame and outputs 51 **blendshape
scores**, one per facial movement (`jawOpen`, `browInnerUp`, `eyeBlinkLeft`, …).
Each score runs from 0 to 1. They aren't calibrated measurements: a neutral face
can score 0.3 on something. (On a still photo with a neutral brow, `browDownLeft`
read 0.76.) **That is the whole reason this project exists:** a fixed threshold like
"0.5 means frowning" is wrong for some faces.

A **gesture** (`src/signal/gestures.ts`) is a formula over these scores that gives
one number from 0 to 1:
- *Raise eyebrows* = the larger of `browInnerUp` and the outer-brow scores.
- *Smile* = the larger of left and right smile, so a one-sided smile still counts.
- *Close left eye* = `eyeBlinkLeft − eyeBlinkRight`. A normal blink closes both eyes,
  so the difference stays near 0. Only a deliberate one-eye close makes it rise.

**Smoothing** (`smoothing.ts`): each new value pulls the smoothed value part of the
way toward it ("exponential moving average"). How far depends on the time since the
last frame, so it behaves the same at 15 or 60 frames per second. The time constant
is 80 ms.

**Questions:** Why is wink a *difference* of two scores? Why does smoothing use time
instead of "every N frames"?

---

## 1. Calibration: measuring each movement for this person

`src/signal/calibration.ts: analyzeCalibration`

**What gets recorded:**
1. **Rest, still** (5 s): relaxed face.
2. **Rest, natural** (10 s): talking (or moving the mouth as if talking) and looking
   around. *This shows what everyday movement looks like, so the app learns what to
   ignore.*
3. **5 tries of each movement:** "Get ready…" (1.2 s), "Raise your eyebrows NOW"
   (2.5 s window), "Relax" (1.3 s).

Only numbers are recorded (a **trace**), never images.

**For each movement, it computes:**

| Name | Meaning | How |
|---|---|---|
| `restLevel` | How high it goes when you're *not* trying | 98th percentile of the smoothed signal over both rest parts |
| held peak | How strongly you did it in one try | The highest level you **kept up for the hold time** (250 ms) in that 2.5 s window (`heldPeak`) |
| `typicalPeak` | A typical try | Median of the 5 held peaks |
| `gap` | How far above "doing nothing" a typical try reaches | `typicalPeak − restLevel` |
| `on` | Line the signal must cross to start a gesture | Halfway from `restLevel` to `typicalPeak` |
| `off` | Line it must drop below to end it | Halfway from `restLevel` to `on` |
| `hitRate` | How consistent you are | Leave-one-out (below) |
| `auc` | How cleanly tries separate from rest | Below |
| `reactionMs` | How long until it would fire | Runs the real detector on each try |
| `crossTalk` | Does doing this also trigger other movements? | Below |

**Worked example:** rest level 0.05, typical peak 0.85.
`on` = 0.05 + 0.5 × 0.80 = **0.45**. `off` = 0.05 + 0.5 × 0.40 = **0.25**.

**Why "held peak" and not just the maximum?** Live control only fires if the signal
stays above `on` for 250 ms. A one-frame spike doesn't count there, so it shouldn't
count here either. With held peaks, "this try would have worked" means *exactly*
the same thing in calibration as in live use.

**Leave-one-out hit rate:** if we set the threshold from all 5 tries and then checked
those same 5 tries, they'd look better than they really are, because they helped set
the threshold. Instead: hide try #1, set `on` from tries #2–5, and check whether try
#1 reaches it. Repeat for each try. The fraction that pass is the hit rate. It's the
same idea as cross-validation in machine learning.

**AUC (separation from rest):** rest is cut into overlapping 2.5 s windows, the same
length as a try, and we find the held peak of each. AUC is the chance that a random
try beats a random rest window: 1.0 means every try beat every rest window, and 0.5
is a coin flip.

**Cross-talk:** while you did movement A, how close did movement B get to *its own*
`on` line? 0 means B stayed at rest, and 1 means B would have fired too. This is
averaged over A's tries. Example: in the synthetic test person, puffing cheeks also
lifted the smile to 1.56 × smile's `on` line, so "puff cheeks" and "smile" can't
both be used.

**A movement is usable only if all of these hold:**
- at least 3 tries were recorded with the face visible
- gap ≥ 0.10 (otherwise it's "too small to tell apart from resting or talking")
- AUC ≥ 0.90
- hit rate ≥ 0.80 (4 of 5)

**Score** (0 to 1) = hitRate × AUC × min(1, gap ÷ 0.30). That's
*reliable × separable × big enough*. Past a gap of 0.30, more doesn't help.

**Sensitivity (added 2026-10-25), `src/signal/profile.ts: withReach`:** calibration
*measures* everything with `on` halfway (reach 0.5). Talk then works the lines out
again from the same `restLevel` and `typicalPeak`, at the person's sensitivity setting
(Settings → "Movement needed", default **0.4**, range 0.3–0.6):
`on` = rest + reach × (peak − rest), and `off` = halfway from rest to `on`. Example at
the default: `on` = 0.05 + 0.4 × 0.80 = **0.37**, `off` = **0.21**. Why: movements made
while typing are often smaller than calibration's deliberate ones. On synthetic test
people, tries half the size of calibration's were caught 23% of the time at reach 0.5
and 97% at 0.4 (`tests/sensitivity.test.ts`).

**Questions:** Why does the rest phase include talking? Why leave-one-out instead of
testing tries against the threshold they set? What does an AUC of 0.5 mean? Why put
`on` halfway rather than just above rest? Why does lowering `on` also lower `off`, and
when could that make re-arming harder?

---

## 2. Selection: choosing the person's 1–3 movements

`src/signal/selection.ts: selectGestures`

**Goal:** movements that are each reliable *and* don't interfere with each other.

- **Conflict** between A and B = the worse of crossTalk[A→B] and crossTalk[B→A]
  (doing A may trigger B even if B doesn't trigger A).
- A group is **allowed** only if every pair's conflict is below 0.5.
- An allowed group's **value** = (sum of the scores) × (1 − conflict) for every pair,
  so even mild overlap costs something.
- **Every** group of 3 usable movements is tried, and the best allowed one wins. If no
  group of 3 is allowed, it tries 2, then 1.

Why try everything instead of a clever shortcut? Calibration offers 9 candidates (12
are defined, and 3 were retired on 2026-10-25, see below), so there are at most 84
groups of 3 (220 if all 12 were tested), which takes microseconds, and trying them all *guarantees* the best
group. A greedy shortcut ("take the best, then the next best that doesn't conflict")
can miss better combinations.

**Jobs:** the best movement gets **SELECT**, because it's used most and it's the only
one auto-scan needs. Then NEXT, then BACK. With just **one** usable movement, the
person can still type with auto-scan.

**Questions:** Why check cross-talk in both directions? Why can exhaustive search be
better than greedy here? What happens if only one movement works?

---

## 3. Turning a signal into clean clicks: hysteresis, hold, refractory

`src/signal/detector.ts: GestureDetector`, `src/signal/engine.ts: ControlEngine`

A raw signal wobbles. With one line, a wobbly smile would click five times. Four rules
fix that:

1. **Hysteresis (two lines).** Start above `on` (0.45), end below `off` (0.25).
   Wobbling between 0.25 and 0.45 changes nothing. A thermostat works the same way:
   heat on at 19°, off at 21°, so it doesn't flicker.
2. **Minimum hold.** The signal must stay above `on` for 250 ms before it fires.
   Brief twitches are too short. (Blinks are handled differently: the wink
   formula subtracts one eye from the other, so a two-eye blink stays near 0.)
3. **One click per gesture.** After firing, nothing happens until you relax below
   `off`. Holding a smile doesn't repeat.
4. **Refractory period.** After relaxing, the detector ignores input for 400 ms, so a
   bouncy release can't count as a second click.

States: **ready** → (above `on`) → **pending** → (held 250 ms) → **FIRE**, then
**holding** → (below `off`) → **cooldown** → (400 ms) → **ready**.
If the signal drops below `on` while pending, it returns to ready.

**Safe start:** the detector starts in *holding*. If someone is already mid-gesture
when control starts, or when their face comes back into view, they must relax first.

**The engine adds two rules across gestures:**
- **One at a time:** while any gesture is held, no other can fire.
- **Shared cooldown:** after any action fires, no action can fire for 400 ms. If two
  fire on the same frame, the one further past its own `on` line wins.
- No face means nothing fires. If the face was gone for more than 300 ms, everything
  resets.

**Questions:** What problem does hysteresis solve that a hold time doesn't (and vice
versa)? Why start in "holding" instead of "ready"? Why the one-at-a-time rule?

---

## 4. Drift and fatigue adaptation

*Not built yet. This section will be written when it is.*

---

## Scanning keyboard (supporting logic)

`src/keyboard/scanner.ts`

**Row/column scanning:** the highlight moves down the rows. SELECT goes into a row,
the highlight then moves across its keys, and SELECT picks one. **Auto** mode moves by
itself, which needs only one gesture. **Step** mode moves on NEXT, so the person sets
the pace. Letters are ordered by English frequency (E T A O I N …), so common letters
take fewer steps. The command row (Speak, Space, Delete, Phrases, Pause) comes first.
The first item after any change stays highlighted 1.5× longer, giving the person
time to relax and get ready. Scan speed never goes below 0.5 s per step, so nothing
changes more than twice a second.

---

## 5. Word prediction (planned: this is the design, not built yet)

Planned for M8 (`PLAN.md`). This section explains the intended design so it can be
discussed and challenged before it's built. It will be updated to match the real code.

**The problem.** In scanning, each letter costs about 2 selections (choose the row,
then the key) plus waiting for the highlight. "thank you " (10 characters, counting
the spaces) is about **20 selections**.

**The data structure: a trie (prefix tree).** Each step down the tree is one letter,
so the path from the top spells a beginning of a word. Nodes where a real word ends
store that word's counts.

```
(root)
 └ t
   └ h
     ├ e  ← "the"
     │ ├ y  ← "they"
     │ └ n  ← "then"
     └ a
       └ n
         └ k  ← "thank"
```

To suggest words for "th": walk `t` → `h` (2 steps, however big the word list is),
then collect the words below that node and rank them. Adding a new word the person
types is just walking down and creating the missing letters.

*Honest note:* with a few thousand words, a plain list filtered by "starts with"
would also be fast enough. The trie is chosen because lookups depend on the prefix
length rather than the list size, and because adding learned words is natural.
Speed alone isn't the reason.

**Ranking: mix the general list with the person's own words.**

> score(word) = (1 − λ) × base(word) + λ × personal(word)

- **base** = the word's share of all counts in the bundled word list.
- **personal** = the word's share of all words this person has finished.
- **λ (lambda)** = n ÷ (n + 50), where n = how many words the person has typed so
  far. At the start λ = 0, so only the bundled list counts. After 50 words it's
  half-and-half. After 500 words it's mostly personal. Mixing a general model with a
  personal one this way is called *interpolation*.

*Worked example (made-up numbers):* the prefix is "th". In the bundled list, "the" has
a share of 0.06 and "thank" has 0.0004. The person has finished 60 words, 6 of them
"thank" (personal share 0.1) and none of them "the". So λ = 60 ÷ 110 ≈ 0.55.
- thank: 0.45 × 0.0004 + 0.55 × 0.1 ≈ **0.055**
- the: 0.45 × 0.06 + 0.55 × 0 ≈ **0.027**

So "thank" is suggested first *for this person*, even though "the" is far more common
in general.

**Learning.** When a word is finished (Space, punctuation, or Speak), its personal
count goes up by 1, and new words are added to the trie. Only letters and apostrophes
count, and words must be at least 2 letters long. The counts are stored only in this
browser and can be cleared in Settings. They're **left out of exports by default**,
because a list of someone's words reveals what they've been saying.

**In the keyboard.** The top 3–5 suggestions form one scan row. Choosing one replaces
the partial word and adds a space.

**Measuring it: keystroke savings.** In scanning, a "keystroke" is one *selection*
(one gesture).

> keystroke savings = 1 − (selections with prediction ÷ selections without)

*Hypothetical example:* "thank you " without prediction takes about 20 selections.
With prediction: t (2), h (2), pick "thank" (2), pick "you" (2) = 8 selections, so
savings = 1 − 8/20 = **60%**.

**The catch: fewer selections doesn't automatically mean faster typing.** Every time
suggestions appear, the person has to read them. In auto-scan, the highlight also
passes through the suggestion row, which costs time on every letter where no
suggestion is wanted. Published studies of word prediction for people using
switches have found that keystroke savings often don't translate into faster text
entry (for example Koester & Levine, 1996, *Augmentative and Alternative
Communication* 12(3); read the paper before building this, and check the citation
before quoting it). That's why the evaluation measures **characters per minute**
with prediction on and off, not just keystroke savings.

**Questions:** Why does a trie lookup depend on the prefix length and not the list
size? What does λ do, and why does it grow gradually instead of switching straight to
personal words? How can 60% keystroke savings still fail to make typing faster? Why
is the learned word list kept out of the progress report by default?

---

## 6. Storage: guest mode and local profiles

Built 2026-10-22. Code: `src/storage/` (`schema.ts` and `settings.ts` are pure and
tested in `tests/storageSchema.test.ts`; `profileDb.ts` talks to IndexedDB;
`store.ts` holds the two kinds of session). Planned but not built yet: the history
view, backup export/import, and the one-time guest report.

**Two kinds of session, one interface.** Screens save through an `AppStore` and don't
know which kind they have:
- **GuestStore:** everything lives in the page's memory. **Nothing is written
  anywhere,** not even an empty database, so closing or reloading the tab erases it.
  The browser test checks this: after a full guest session (camera, calibration,
  theme change) there are zero databases and zero localStorage keys.
- **ProfileStore:** a local profile in **IndexedDB**, the browser's built-in database.
  It lives only in this browser on this device. There's no server, so there's nothing
  to log in to. A profile is just a nickname.

**Database `tessera`, version 1:**

| Store | Key | What one record holds |
|---|---|---|
| `meta` | `key` | `{ key: "activeProfileId", value }`: which profile opens automatically next time |
| `profiles` | `id` (random, made on this device) | `{ schemaVersion, id, nickname, createdAt, updatedAt, settings, control }`: `control` is the gesture → action setup and thresholds |
| `sessions` | `id`, indexed by `profileId` | `{ schemaVersion, id, profileId, startedAt, calibration: { durationMs, chosen[], gestures[] } }` |

- **The database is only created when someone creates a profile.** On startup, the app
  checks whether it exists (`indexedDB.databases()`) *without* creating it.
- **Each calibration is stored as summary numbers** (hit rate, AUC, gap, thresholds,
  reaction time per gesture), about **1.7 KB**. A raw recording would be several
  megabytes.
- **Never stored:** video, frames, images, face landmarks (face shape), raw recordings,
  or typed messages.

**Caps:** at most 20 profiles, and at most 500 sessions per profile. Past the cap, the
oldest sessions are dropped automatically.

**Versioned schema and migrations.** Every record carries `schemaVersion`. When a
future version changes the shape, a **migration** function upgrades old records one
step at a time (v1 → v2 → v3). Each migration is a pure function,
`(oldRecord) => newRecord`, so it's testable without a browser. `readProfileRecord()`
also repairs bad settings and safely *rejects* damaged data, or data from a newer
version, instead of crashing. (Version 1 is the only one so far, so the migration
list is empty, but the place for it exists.)

**Data from older versions of the app.** Earlier versions kept the setup in
localStorage. The first time someone creates a profile, that old data is moved into
it and then deleted from localStorage. Nothing new is ever written to localStorage.

**Storage that might not last.** After creating a profile, the app asks the browser to
keep its data (`navigator.storage.persist()`). If the browser says no, the app warns:
*"this browser may erase your profile, for example in a private window or when
browsing data is cleared."* Private browsing can't be detected for certain, so the
warning says *may*. If the database can't open at all, the app explains why and offers
guest mode.

**Honest limits:** anyone using the same browser on the same computer can open a
profile. There's no password, because with no server a password could only be checked
on the device itself, which would protect very little. The UI says this.

**Questions:** Why does guest mode avoid even *opening* the database? Why store
summaries instead of recordings? What's a migration, and why should each one be a pure
function? Why can't the app promise to detect private browsing? Who can see a local
profile?

**Planned, not built yet:**
- A `words` store for M8, `{ profileId, word, count }`, holding learned word frequencies.
- Backups as a file, downloaded only when the person clicks Export:
  `{ format: "tessera-backup", schemaVersion, exportedAt, profile, sessions[] }`.
  Import will check the format, run the same migrations, and ask before overwriting.
- A warning based on `navigator.storage.estimate()` before space runs low.

---

## 7. Movement-map colors: from calibration numbers to face regions

Built 2026-10-22 (step V2a). The logic is plain TypeScript in
`src/signal/movementMap.ts` (no Three.js, no React) and is unit tested in
`tests/movementMap.test.ts`. The regions are in `src/viz/faceRegions.ts`.

**Step 1: regions.** The face is split into 8 named regions. Each is a list of
landmark numbers (MediaPipe numbers 468 face points the same way every time):
- **Eyes, eyebrows, lips** come straight from MediaPipe's own connection sets
  (`FACE_LANDMARKS_LEFT_EYE`, `..._LEFT_EYEBROW`, `..._LIPS`, and the `RIGHT_`
  versions).
- **Jaw and chin** = every point lower than the lowest lip point.
- **Left and right cheek** = points between the mouth corners and the bottom of the
  eyes, further out to the side than the mouth corners, split by side.

The cheek and jaw lines are measured from the other regions on MediaPipe's
*standard face*, not typed in as numbers. Tests check that every region has points,
that no point is in two regions, that the left regions really are on the person's
left, and that the regions are stacked in the right order from top to bottom.

"Left" always means the **person's own left**. I checked this twice: on a test photo,
MediaPipe's `LEFT_EYE` sits on the person's left, and on the standard face the person's
left is +x.

**Step 2: which gestures belong to which region.**

| Gesture | Region(s) |
|---|---|
| Raise eyebrows, Frown | left eyebrow + right eyebrow |
| Close left eye / right eye | left eye / right eye |
| Smile, Pucker, Lips left/right | lips |
| Open mouth *(retired)* | lips + jaw/chin |
| Jaw left *(retired)* / Jaw right | jaw/chin |
| Puff cheeks *(retired)* | left cheek + right cheek |

**Retired gestures (2026-10-25):** Open mouth, Puff cheeks, and Jaw to your left are
no longer offered in calibration, because they were too hard for everyone the owner
tried them with. They stay defined in `src/signal/gestures.ts` (`offered: false`), so
older saved profiles and recordings still load and still show their results. Nothing
offered tests the **cheeks** any more, so the cheeks get no dot and are drawn like
the rest of the face, with "no test for this area" in the table. That's better than a
red "not tested yet" dot that could never be cleared (`TESTABLE_REGIONS` in
`src/signal/movementMap.ts`).

**Step 3: one number per gesture.** The person picks which number to show:
- **Reliability** = the calibration hit rate (0–100%), **except** that a movement
  calibration rejected as *too small* or *looking like resting/talking* shows **0%**.
  Why: a movement that barely moves can "hit" a threshold buried in the noise every
  time, so its hit rate says 100% for something that doesn't really work. The first
  version had exactly this bug. The browser test showed "Jaw to your left 100% (not
  reliable)", and a unit test now guards against it.
- **Range** = how far above rest a typical try reached, as a share of a "fully
  strong" movement: `min(1, gap ÷ 0.30)`.

**Step 4: one number per region** = the **highest** value among that region's tested
gestures. That answers "what's the best way this person can use this part of their
face?" The table and labels still list every gesture separately, for example
*"Lips: 100% (Smile 100%, Open mouth 0%)"*. A region with no tested gesture is
**"not tested"** (gray). That's different from tested-and-weak, which shows as 0%.

**Step 5: number → color.**
- **5 bins:** 0–20%, 20–40%, 40–60%, 60–80%, 80–100%.
- **The colors:** `#1c5cab` → `#2a78d6` → `#5598e7` → `#86b6ef` → `#b7d3f6`, one blue
  that gets **lighter as values rise**, so it still reads in black-and-white. It
  passed a palette checker (the dataviz validator, against this app's dark
  background):
  - lightness changes in one direction only
  - every step is visibly different from the next
  - the darkest step still stands out from the background (2.85:1)
- **Other colors:** gray `#7b818c` means "not tested", and darker gray `#3d4350` is
  the rest of the face.
- **Never color alone:** the head has text labels with numbers, plus a legend and a
  table of every number.

**Step 6: region → points.** `pointColors()` returns one color per face point. The 3D
view (`src/viz/head3d.ts`) just displays that list. All the deciding happens in the
tested module.

**The two face shapes:**
- **Live** = the person's own landmarks, redrawn up to 20 times a second. The head
  turns as they turn, like a mirror.
- **Standard** = MediaPipe's standard face. **Exported images always use the standard
  face and the front view,** so an exported image never contains someone's real face
  shape. I verified that the standard face numbers its points the same way as the
  live landmarks: on a test photo, the distance patterns between points matched with
  a correlation of 0.98, versus about 0 when the numbering was shuffled.

**Questions:** Why use the highest gesture value for a region instead of the average?
Why is "not tested" different from 0%? Why does a too-small movement show 0%
reliability even if its hit rate was 100%? Why bins instead of a smooth color
gradient? How is the map still readable for someone who can't tell colors apart? Why
does the exported image use the standard face?
