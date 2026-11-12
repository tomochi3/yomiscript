// Framework-agnostic parts: the tool definition, execute, samples, the browser speaker and the timeline helpers.
export type { SpeakArgs, SpeakData } from "./types.ts";
export { TOOL_NAME, TOOL_DEFINITION } from "./definition.ts";
export { executeSpeak, pluginCore } from "./plugin.ts";
export { SAMPLES } from "./samples.ts";
export { configureSpeaker, speakerOptions, loadKatarite, synthesize, play, type SpeakerOptions, type Loader, type Playback } from "./speaker.ts";
export { spanAt, pieces } from "./timeline.ts";
