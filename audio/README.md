# Audio Files Directory

Place your audio recording files in this directory.

## Supported Formats
- MP3 (recommended)
- WAV
- OGG
- M4A

## File Organization
Organize your files with clear, descriptive names:

```
audio/
├── class-001-introduction.mp3
├── class-002-advanced-topics.mp3
├── class-003-practical-examples.mp3
└── class-004-review-session.mp3
```

## File Size Considerations
- For GitHub Pages: Keep files under 100MB each
- For better loading: Consider compressing audio files
- For mobile users: Optimize file sizes for faster streaming

## Security Note
While the audio files are stored in this public directory, the player system includes multiple layers of protection to prevent unauthorized downloading and access outside of scheduled times.

## Example Files
Replace these example filenames in your `config.js`:

```javascript
audioFile: 'audio/your-actual-audio-file.mp3'
```

Make sure the path in your configuration matches the actual filename in this directory.