# Tabletop Ambient Audio — Prototype Requirements

**Status:** Draft for implementation planning  
**Target:** Android  
**Initial delivery candidate:** Installable PWA; validate before committing to the platform

## Product goal

Give a tabletop game host a simple way to organize personally selected audio by game, play a looping ambience, and trigger sound effects during a session.

## Confirmed scope

- Android only for the prototype.
- Start with an installable PWA. If a device-level spike shows that it cannot reliably meet the required background playback behavior, switch to a native Android app.
- A user can create, rename, open, and delete game entries.
- Each game has its own soundboard with user-selected audio files imported from the phone. Google Drive import is excluded from this prototype.
- The user can assign files as ambience or sound effects.
- One ambience track plays at a time and repeats the entire file. No trim editor, loop-point editor, or seek bar is required.
- Provide explicit Play, Pause, and Stop controls. Pause retains playback position; Stop stops the track and resets it to the beginning.
- Sound effects play over the ambience. Provide separate volume controls for ambience and effects.
- Use fades when starting, pausing/stopping, and switching ambience tracks; choose and validate fade duration during the audio spike.
- Audio and game data remain local to the device. The app has no account, cloud upload, cross-device sync, sharing, or monetization.
- Playback should continue with the screen locked. Do not mix with other apps' audio. When a call or another audio source interrupts playback, pause the app's audio and require the user to press Play to resume.

## Deleting a game and its audio

- Before deletion, show a confirmation prompt that makes clear the game's imported audio will also be removed from the app.
- After confirmation, delete the game, its soundboard entries, and the audio copies managed by the app for that game.
- Never delete the user's original files from the phone's file system.
- If the same source file was imported separately into another game, deleting one game must not delete the other game's app-managed copy.

## Out of scope

- iOS.
- Google Drive integration.
- Built-in or bundled copyrighted game soundtracks, soundtrack discovery, download links, or server-side audio hosting.
- User accounts, sharing, and synchronization.
- Payments or subscriptions.
- Audio trimming and custom loop points.

## Acceptance checks

1. Create multiple games, assign different audio, close and reopen the PWA, and confirm each game's soundboard is retained.
2. Import audio from the phone; confirm it is copied into app-managed local storage and remains playable offline after restart.
3. Start an ambience and confirm the full file repeats from its beginning. Test a loop-ready sample and document any audible gap/click with ordinary files.
4. Verify Play, Pause, Resume, and Stop. Pause retains position; Stop resets to the beginning; no seek control is shown.
5. Trigger effects while ambience plays. Confirm the ambience continues and the two volume controls act independently.
6. Switch ambience tracks and use Pause/Stop; confirm fades avoid abrupt cuts, loudness spikes, or duplicate continuing players.
7. Lock the screen and leave the app in the background; confirm ambience continues and app state stays correct. Test lock-screen controls if available.
8. Start another audio app and handle an incoming call while the ambience plays. Confirm app playback pauses, does not mix with external audio, and does not resume automatically.
9. Delete a game and cancel the confirmation; confirm the game and its files remain.
10. Delete a game and confirm; confirm the game, sound list, and its app-managed audio copies are removed, while original phone files and other games' imports remain.
11. Test offline playback and storage exhaustion/rejection; show a clear error if the browser cannot persist an imported file.

## Technical spike / platform decision gate

Before building the full soundboard, test on the user's Android phone (and ideally one other Android device): local file import, persistent offline storage, full-file looping, fades, layered ambience/SFX, lock-screen playback, and interruption behavior.

PWA background playback and system audio interruption control may vary by browser/device. If the PWA cannot reliably continue playback while locked and pause on calls/other audio, document the failure and move to a native Android media-session/foreground-playback implementation before expanding the UI.

## Content boundary

The prototype imports files selected by the user and does not supply, host, or distribute game soundtracks. The user's ability to select a file does not establish permission to copy or use that file. Keep audio local and do not market the app as a source or downloader of copyrighted tracks.

## Still to decide during implementation planning

- Supported input formats and practical per-file/storage limits, based on Android browser tests.
- Exact fade duration and whether effects themselves fade.
- Whether several sound effects may overlap each other, in addition to playing over ambience.
- Whether playing an effect after switching games should stop the previous game's ambience immediately or fade it out.
