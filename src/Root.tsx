import type {ProjectState} from "@make-video/contracts";
import {ProjectComposition} from "@make-video/remotion";
import {Composition} from "remotion";

type CompositionProps = {state: ProjectState};

const emptyState: ProjectState = {
  videoId: "make-video",
  composition: {fps: 30, durationInFrames: 30, width: 1920, height: 1080},
  models: {image: null, video: null, voice: null},
  registry: {image: [], video: [], voice: []},
  scenes: [],
  captions: [],
  effects: [],
  audio: {
    voiceover: {id: "voiceover", label: "Voiceover", path: "", exists: false, url: null},
    music: {id: "music", label: "Music", path: "", exists: false, url: null},
    sfx: [],
  },
  cover: null,
  assets: [],
  stages: [],
  revisions: [],
  sources: [],
  plan: null,
  qa: null,
  delivery: null,
};

export const RemotionRoot = () => <Composition<any, CompositionProps>
  id="MakeVideo"
  component={ProjectComposition}
  defaultProps={{state: emptyState}}
  calculateMetadata={({props}) => ({
    durationInFrames: props.state.composition.durationInFrames,
    fps: props.state.composition.fps,
    width: props.state.composition.width,
    height: props.state.composition.height,
  })}
/>;
