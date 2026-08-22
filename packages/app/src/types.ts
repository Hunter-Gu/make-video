export type PreviewMode = 'player' | 'rendered' | 'storyboard';
export type InspectorMode = 'scene' | 'caption' | 'voice' | 'effect' | 'audio' | 'image';
export type TimelineSelection =
  | {type: 'scene'; id: string}
  | {type: 'caption' | 'voice'; id: string}
  | {type: 'effect'; id: string}
  | {type: 'music'; id: string};
