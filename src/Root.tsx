import {Composition} from "remotion";

import {LibraryOfAlexandria} from "./library-of-alexandria/LibraryOfAlexandria";
import config from "./library-of-alexandria/video.config.json";

export const RemotionRoot = () => {
  return (
    <Composition
      id={config.composition.id}
      component={LibraryOfAlexandria}
      durationInFrames={config.composition.durationInFrames}
      fps={config.composition.fps}
      width={config.composition.width}
      height={config.composition.height}
    />
  );
};
