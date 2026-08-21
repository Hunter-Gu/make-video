export const formatTime = (frame: number, fps: number) => {
  const seconds = frame / fps;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${String(Math.floor((seconds % 1) * 100)).padStart(2, '0')}`;
};
