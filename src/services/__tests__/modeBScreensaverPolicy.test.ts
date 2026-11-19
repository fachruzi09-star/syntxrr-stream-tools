import {
  isSupportedScreensaverAssetSelection,
  normalizeModeBScreensaver,
  toStudioScreensaverSettings,
} from '../modeBScreensaverPolicy';

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

const disabled = normalizeModeBScreensaver(undefined);
assertEqual(disabled.on, false, 'screensaver is disabled by default');
assertEqual(disabled.text, 'Sedang menunggu host', 'default waiting text');
assertEqual(disabled.enter.type, 'fade', 'default enter transition');
assertEqual(disabled.enter.duration, 300, 'default enter fade duration');

const configured = normalizeModeBScreensaver({
  on: true,
  text: 'Host sedang menyiapkan LIVE',
  media: 'content://private/media/1',
  mediaSound: true,
  enter: { type: 'fade', duration: 450 },
  exit: 'cut',
});
assertEqual(configured.on, true, 'enabled setting retained');
assertEqual(configured.text, 'Host sedang menyiapkan LIVE', 'custom text retained');
assertEqual(configured.media, 'content://private/media/1', 'media metadata preserved');
assertEqual(configured.mediaSound, true, 'media sound metadata preserved');
assertEqual(configured.enter.type, 'fade', 'fade entry retained');
assertEqual(configured.enter.duration, 450, 'entry duration retained');
assertEqual(configured.exit.type, 'cut', 'cut exit retained');
assertEqual(configured.exit.duration, 0, 'cut duration normalized');

let invalidDurationRejected = false;
try {
  normalizeModeBScreensaver({ on: true, enter: { type: 'fade', duration: 99 } });
} catch {
  invalidDurationRejected = true;
}
assertEqual(invalidDurationRejected, true, 'out-of-range fade duration rejected');

const legacyTransition = toStudioScreensaverSettings({ on: true, enter: 'cut', exit: 'fade' });
assertEqual(legacyTransition.enter, 'cut', 'legacy string transition retained by the Studio editor');
assertEqual(legacyTransition.exit, 'fade', 'legacy exit string retained by the Studio editor');

const localImage = normalizeModeBScreensaver({
  on: true,
  media: 'studio-media://media_saver_123',
});
assertEqual(localImage.media, 'studio-media://media_saver_123', 'local image reference remains in the preset');
assertEqual(localImage.on, true, 'image-backed screensaver remains enabled');

const localGif = normalizeModeBScreensaver({ on: true, media: 'studio-media://media_saver_gif_456' });
assertEqual(localGif.media, 'studio-media://media_saver_gif_456', 'GIF screensaver reference remains portable');
assertEqual(localGif.mediaSound, false, 'GIF playback does not implicitly enable media audio');
assertEqual(localGif.mediaType, 'image', 'legacy local GIF metadata defaults to image media type');

const localVideo = normalizeModeBScreensaver({
  on: true,
  media: 'studio-media://media_saver_mp4_789',
  mediaType: 'video',
});
assertEqual(localVideo.mediaType, 'video', 'local MP4 Screensaver media type is preserved');

const localVideoWithSoundFlag = normalizeModeBScreensaver({
  on: true,
  media: 'studio-media://media_saver_mp4_sound_999',
  mediaType: 'video',
  mediaSound: true,
});
assertEqual(localVideoWithSoundFlag.mediaType, 'video', 'MP4 remains a video screensaver when audio flag is enabled');
assertEqual(
  localVideoWithSoundFlag.mediaSound,
  true,
  'mediaSound remains portable metadata while native video stays muted',
);

assertEqual(isSupportedScreensaverAssetSelection('video', 'video', 'video/mp4'), true, 'local MP4 accepted for video screensaver');
assertEqual(isSupportedScreensaverAssetSelection('video', 'image', 'image/gif'), false, 'image cannot be staged as video');
assertEqual(isSupportedScreensaverAssetSelection('image', 'image', 'image/gif'), true, 'local GIF accepted as image media');
assertEqual(isSupportedScreensaverAssetSelection('image', 'image', 'image/webp'), false, 'unsupported WebP rejected for screensaver');

console.log('Mode B screensaver policy tests passed: 27 assertions.');
