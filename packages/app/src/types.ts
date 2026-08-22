export type PreviewMode = 'player' | 'storyboard';
export type InspectorMode = 'scene' | 'caption' | 'voice' | 'effect' | 'audio' | 'image' | 'settings';
export type TimelineSelection =
  | {type: 'scene'; id: string}
  | {type: 'caption' | 'voice'; id: string}
  | {type: 'effect'; id: string}
  | {type: 'music'; id: string};
