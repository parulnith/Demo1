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

## 3D Finn character study

`prototype/finn-3d.html` is a 3D fantail goldfish built with three.js (r128 from cdnjs): an egg-shaped body with scales and a clearcoat sheen, see-through rayed fins, breathing gills, and large expressive eyes with lids that carry the mood.

- **Moods:** Happy, Restless, Worried, Parched. Each changes colour, fin spread, eyelids, gaze and swimming behaviour.
- **Extras:** a refill celebration (a loop-the-loop and a burst of bubbles), and food you can drop by tapping.
- **Next:** once the look is approved, this fish replaces the 2D one in the watch preview. Later it can be exported as a 3D model for SceneKit in the real watchOS app.
