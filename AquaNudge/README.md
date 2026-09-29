# AquaNudge

An Apple Watch app that nudges you to move. Finn the goldfish lives in a tank on your wrist:
the water drains while you sit and refills as you walk.

## Phase 0: browser preview

`prototype/index.html` is a clickable preview of the watch app, made to tune the look and feel before any Swift code is written.

- **Screens:** Aquarium, Watch face (complication), Always-on, Nudge (notification)
- **Simulator:** sitting or walking, speed up time, jump ahead, or set the water level directly
- **Interactions:** tap the water to feed Finn; scroll or drag the Digital Crown to slosh the tank

Tank rules used in the preview:
- 30 min of sitting before any water drains
- after that, a full tank drains in 2.5 h if you keep sitting
- every 250 steps puts back 10% of the water

Moods: Happy (70%+), Restless (40–70%), Worried (15–40%), Parched (below 15%). Finn never dies.

The page is authored for the Claude artifact viewer, which adds the `<html>/<head>` skeleton; it also opens directly in a browser.
