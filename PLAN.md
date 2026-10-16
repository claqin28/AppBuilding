# Plan

What gets built, in what order, and what gets cut first. Reasons live in
`DECISIONS.md`; algorithm explanations live in `WALKTHROUGH.md`.

## Hard constraints (apply to every milestone)

1. **Everything runs in the browser.** No video or frames leave the device or are stored.
2. **No network calls except loading the app's own files.** Enforced by a
   Content-Security-Policy (`connect-src 'self'`) in dev and production.
3. **Any sharing or export is user-initiated and local-only:** copy to clipboard,
   download a file, or the Web Share API (which hands the content to an app the
   person picks on their own device). **Nothing is ever sent automatically, and
   nothing is ever sent to a server.**
4. Static hosting only (HTTPS), with no accounts and no backend.
5. **Not a medical device, not an emergency system.** Nothing may imply that the app
   alerts or calls anyone.
6. No speech recognition. Text-to-speech uses on-device voices only.
7. Desktop Chrome on a laptop is the only supported target. Mobile is untested and
   not claimed.
8. No user-validation claims. Testers so far are able-bodied volunteers, and that is
   stated wherever results appear.

## Build order and status

| # | Milestone | Status |
|---|---|---|
| M1 | Camera + live signals + setup checks | ✅ Done |
| M2 | Calibration + gesture selection | ✅ Done (thresholds need tuning on real data) |
| M3 | Control engine + scanning keyboard + speech | ✅ Done (basic quick phrases included) |
| **M4** | **Evaluation mode** | ⏭ Next, after the first real-webcam test |
| M5 | Drift and fatigue adaptation | Planned |
| M8 | Saved, editable quick phrases | Planned (partly done in M3) |
| M9 | Local share and export (message + progress report) | Planned |
| M10 | Word prediction | Planned |
| M6 | Adaptive practice games | Planned. **First to cut** |
| M7 | Polish, offline install (PWA), public link | Planned. See the note on deploying early |

(The new features are numbered M8–M10 so that M6 and M7 keep their original names.)

## If time gets tight

Protect in this order: **M1–M4 → M5 → M8 + M9 → M10.** **M6 (practice games) is cut
first.**

*Recommendation, pending your OK:* M7 isn't in the priority list, but two of its
pieces are small and unblock testing with volunteers: the **public HTTPS link**
(GitHub Pages) and the **offline install**. I suggest doing those as soon as GitHub
access works, and leaving the rest of M7's polish for the end.

---

## M4: Evaluation mode (next)

- (a) **60-second idle test:** talk and look around, then count false activations
  per minute.
- (b) **Fixed-phrase typing:** characters per minute and error rate.
- (c) **Personalized vs. fixed thresholds:** the same gestures and the same tests, in
  alternating order (fixed, personal, personal, fixed).
- (d) Log calibration time (already recorded).
- (e) Log session-over-session metrics locally, for the next-day check.
- Results export to JSON/CSV, by download only (constraint 3).
- **Added:** a *scan-step simulator* that types the fixed phrases the way a perfect
  user would and counts scan steps and selections. It's deterministic and needs no
  camera, so it gives repeatable numbers for comparing keyboard designs (M10).

## M5: Drift and fatigue adaptation

Track resting level and active peak over time. Adapt thresholds slowly and within
safe bounds. Detect fatigue (peaks shrinking) and suggest a break or recalibration.
Never let adaptation silently make control worse. Fatigue events are logged for the
M9 report.

## M8: Saved quick phrases

Already built in M3: a Phrases key on the keyboard, one phrase per row (one SELECT
speaks it), default phrases, and a "not an emergency system" note on the Talk screen.

Still to do:
- **Editable list stored locally** (localStorage). Defaults: "I need help",
  "I'm thirsty", "Yes", "No", "Thank you", plus the current extras, all editable.
- **Helper editor** in Settings (add, edit, reorder, delete), using mouse or keyboard.
- **"Save message as phrase"**, reachable by scanning, so the person can add phrases
  without a helper.
- **A label on the phrase screen itself:** "Phrases are spoken aloud in this room
  only. This does not alert anyone or call for help."
- A cap of about 12 phrases, because every extra row costs scan time. The editor says so.

## M9: Local share and export (user-initiated only)

**(a) Message share**
- **Copy** and **Save as .txt** can be chosen by scanning, under a "More" key, so
  they don't slow down normal typing.
- **Share…** (Web Share API) appears **only as a helper button, and only where the
  browser supports it.** The browser allows sharing only after a real click or key
  press, and a face gesture doesn't count. It also isn't available in Chrome on Linux.
- Each option says where the content goes ("Copied to this computer's clipboard",
  "Saved to your Downloads folder", "Opens your device's share menu").

**(b) Progress report** for a caregiver or occupational therapist
- A readable summary (a printable page; "Print → Save as PDF" stays local) plus
  **JSON and CSV** downloads.
- Contents: per-gesture reliability over time, calibration time, false activations
  per minute, typing speed, error rate, fatigue events, and prediction on vs. off
  (once M10 exists).
- **Excluded by default:** typed message text, video (never stored at all), raw
  facial-signal recordings, and the learned word list (it reveals what was typed).
- **Including message text requires an explicit opt-in checkbox,** unchecked every
  time the report screen opens.
- The report shows a preview of exactly what's in the file before download.

## M10: Word prediction

- **My own implementation:** a trie (prefix tree) with frequency-based ranking.
- **Bundled base word list:** small (a few thousand words), with a license that allows
  redistribution with at most attribution (MIT/BSD/Apache/CC0/CC BY), recorded in
  `ATTRIBUTION.md`. **Not chosen yet;** see the DECISIONS entry. Candidates must be
  checked from their actual LICENSE files and screened for offensive words.
- **Personal word frequencies:** learned from words the person finishes, stored only
  in this browser, and clearable in Settings. Excluded from exports by default.
- The **top 3–5 suggestions** appear as one scan row. Choosing one replaces the
  partial word and adds a space.
- **Evaluation (added to M4's evaluation mode):** the same fixed phrases with
  prediction on vs. off, measuring characters per minute, error rate, selections per
  character, and **keystroke savings**. The scan-step simulator gives the
  best-case savings, and real typing shows whether that turns into speed.
- No network calls (constraint 2).

## M6: Practice games (first to cut)

Short target/hold games that give extra practice on the weakest gesture and adjust
difficulty. Track per-gesture mastery.

## M7: Polish

High contrast, large targets, reduced motion, no flashing faster than 3 Hz (most of
this is already in place), caregiver-assisted setup mode, clear error states, offline
install (PWA), and the public link. Optional attention chime, labeled as not an
emergency system.

---

## Proposed, not approved (won't be built unless you say so)

- **Head movements as candidate gestures** (turn, nod, tilt). Many people with high
  spinal cord injury have reliable head control. MediaPipe can output head pose.
- **Next-word prediction** (word pairs), only after M10 shows whether single-word
  prediction helps at all.
