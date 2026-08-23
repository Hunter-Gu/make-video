import {ProjectComposition} from '@make-video/remotion';
import type {ProjectState} from '@make-video/contracts';

export const RemotionComposition = ({state}: {state: ProjectState}) => <ProjectComposition state={state} />;
