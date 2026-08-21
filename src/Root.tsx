import {Composition} from "remotion";

import {LibraryOfAlexandria, type DeliveryProps} from "./library-of-alexandria/LibraryOfAlexandria";
import config from "./library-of-alexandria/video.config.json";

export const RemotionRoot = () => {
  return (
    <Composition<any, DeliveryProps>
      id={config.composition.id}
      component={LibraryOfAlexandria}
      durationInFrames={config.composition.durationInFrames}
      fps={config.composition.fps}
      width={config.composition.width}
      height={config.composition.height}
      defaultProps={{}}
      calculateMetadata={({props}) => {
        const delivery = props as DeliveryProps;
        return {
          width: delivery.renderWidth ?? config.composition.width,
          height: delivery.renderHeight ?? config.composition.height,
        };
      }}
    />
  );
};
