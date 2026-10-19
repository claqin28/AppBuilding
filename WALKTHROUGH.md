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

**Questions:** Why does the rest phase include talking? Why leave-one-out instead of
testing tries against the threshold they set? What does an AUC of 0.5 mean? Why put
`on` halfway rather than just above rest?

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

Why try everything instead of a clever shortcut? With 12 candidates there are at most
220 groups of 3, which takes microseconds, and trying them all *guarantees* the best
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

## 6. Storage schema for local profiles (planned: design, not built yet)

Planned for step P (`PLAN.md`). This will be updated to match the real code.

**Where:** IndexedDB, the browser's built-in database. It lives only in this browser on
this device. There's no server, so there's nothing to log in to. A profile is just a
nickname.

**Database `tessera`, schema version 1. Four "object stores" (tables):**

| Store | Key | What one record holds |
|---|---|---|
| `meta` | `"schema"` | `{ schemaVersion, createdAt }` |
| `profiles` | `id` (random, made on this device) | `{ id, nickname, createdAt, updatedAt, settings, controlSetup }`: `controlSetup` is the gesture→action bindings and thresholds |
| `sessions` | `id`, indexed by `[profileId, startedAt]` | `{ id, profileId, startedAt, endedAt, calibration?, evaluation?, fatigueEvents[] }` |
| `words` (M8) | `[profileId, word]` | `{ count }`: the learned word frequencies |

- `calibration` = `{ durationMs, chosen[], gestures: [{ id, hitRate, auc, gap, restLevel, typicalPeak, on, off, reactionMs, usable }] }`.
  These are *summary numbers*, not recordings.
- `evaluation` = `{ condition, idleFalsePerMin, charsPerMin, errorRate }` (from M4).

**Never stored:** video, frames, images, face landmarks (face shape), raw recordings
(those are only downloaded by choice), and typed messages.

**Why summaries instead of recordings?** A 5-minute calibration recording (51 signals, 30 times a second) is several
megabytes. Its summary is about 2 KB. History charts only need the summaries, and summaries reveal
less about the person.

**Caps.** At most 20 profiles, and at most 500 sessions per profile. When a profile
passes the cap, the oldest sessions are dropped, and the app warns first.
`navigator.storage.estimate()` shows how much space is used, and the app warns before
the browser's limit gets close.

**Versioned schema with migrations.** Every record carries the schema version it was
written with. When the app updates and the schema changes (say, version 2 adds a field),
a **migration** function upgrades old records step by step: v1 → v2 → v3. Each
migration is a pure function, `(oldRecord) => newRecord`, so it can be unit tested
without a browser. The same migrations run when you **import a backup** made by an
older version.

**Backup file format:**
`{ format: "tessera-backup", schemaVersion, exportedAt, profile, sessions[], words[] }`.
It's downloaded only when the person clicks Export. Import checks the format, migrates
the data, and asks before overwriting anything.

**Storage that might not last.** The app asks the browser to keep its data
(`navigator.storage.persist()`). If the browser says no, if storage fails to open, or
if the quota is unusually small (a common sign of private browsing), the app warns:
*"This browser may erase your profile when it closes. Export a backup."* Private
browsing can't be detected for certain, so the wording says *may*.

**Guest mode uses none of this.** Its data lives only in the page's memory, so closing
or reloading the tab erases it.

**Questions:** Why store summaries instead of recordings? What's a migration, and why
must each one be a pure function? Why can't the app promise to detect private browsing?
Who *can* see a local profile? (Anyone using the same browser on the same computer.)

---

## 7. Movement-map colors: from calibration numbers to face regions (planned)

Planned for V2a (`PLAN.md`). The logic will be plain TypeScript in `src/signal/`, with
no Three.js or React, so it can be unit tested.

**Step 1: regions.** The face is divided into named regions. Each region is a set of
landmark numbers, mostly taken from MediaPipe's own connection sets:
- the left eye and left eyebrow come from `FACE_LANDMARKS_LEFT_EYE` and
  `FACE_LANDMARKS_LEFT_EYEBROW`
- the right eye and eyebrow come from the matching `RIGHT_` sets
- the lips come from `FACE_LANDMARKS_LIPS`
- the jaw and chin come from the lower part of `FACE_LANDMARKS_FACE_OVAL`
- the cheeks get hand-picked landmark sets, chosen and checked at build time

"Left" means the **person's own left**. I checked this on a test photo (2026-10-19):
MediaPipe's `LEFT_EYE` set sits on the person's left, matching `eyeBlinkLeft`.

**Step 2: which gestures belong to which region.**

| Gesture | Region(s) |
|---|---|
| Raise eyebrows, Frown | left eyebrow + right eyebrow |
| Close left eye / right eye | left eye / right eye |
| Smile, Pucker, Lips left/right | lips |
| Open mouth | lips + jaw/chin |
| Jaw left/right | jaw/chin |
| Puff cheeks | cheeks |

**Step 3: one number per gesture.** The person picks what to show:
- **Reliability** = the hit rate from calibration (0–100%).
- **Range** = how far above rest a typical try reaches, as a share of a "fully strong"
  movement: `min(1, gap ÷ 0.30)` (0–100%).

**Step 4: one number per region** = the **highest** value among that region's tested
gestures. This answers: *"What's the best way this person can use this part of their
face?"* The label still lists every gesture separately, for example
*"Lips: Smile 100%, Pucker 40%"*. A region with no tested gesture is **"not tested"**,
shown in neutral gray. That's different from tested-but-weak, which shows as a low
value.

**Step 5: number → color.** Values go into **5 bins** (0–20%, 20–40%, … 80–100%). Each
bin gets one color from a sequential palette that:
- gets steadily lighter as values rise, so it still reads in black-and-white
- stays distinguishable for common color-vision deficiencies (checked with a simulator
  when it's built)

**Never color alone:** the legend shows the bin numbers, regions get text labels, and
a table beside the head lists every number.

*Example (made-up numbers):* "Close left eye" had a hit rate of 100%, so the left eye
region is in the top bin. "Close right eye" was skipped, so the right eye is gray and
says "not tested". Smile was 100% and Pucker 40%, so the lips show 100% and the label
lists both.

**Step 6: region → mesh.** Every landmark (vertex) in a region gets that region's
color. Landmarks outside all regions get a neutral face color. This produces one plain
list of colors that the 3D code just displays. All the deciding happens in the
testable module.

**Questions:** Why use the highest gesture value for a region instead of the average?
Why is "not tested" different from 0%? Why bins instead of a smooth color gradient?
How is the map still readable for someone who can't tell red from green?
