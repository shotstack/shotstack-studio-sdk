// Test script to verify drag functionality with multiple clips

const { Edit, Timeline } = require('./dist/shotstack-studio.umd.js');

// Create a mock edit with two tracks, each containing multiple clips
const edit = new Edit({
    timeline: {
        tracks: [
            {
                clips: [
                    {
                        asset: { type: 'video', src: 'test1.mp4' },
                        start: 0,
                        length: 3
                    },
                    {
                        asset: { type: 'video', src: 'test2.mp4' },
                        start: 4,
                        length: 2
                    },
                    {
                        asset: { type: 'video', src: 'test3.mp4' },
                        start: 7,
                        length: 3
                    }
                ]
            },
            {
                clips: [
                    {
                        asset: { type: 'video', src: 'test4.mp4' },
                        start: 1,
                        length: 2
                    }
                ]
            }
        ]
    }
});

console.log("Initial state:");
console.log("=============");
edit.timeline.tracks.forEach((track, trackIndex) => {
    console.log(`Track ${trackIndex}:`);
    track.clips.forEach((clip, clipIndex) => {
        console.log(`  Clip ${clipIndex}: ${clip.asset.src} at ${clip.start}s for ${clip.length}s`);
    });
});

console.log("\nTest setup complete. Use this to verify:");
console.log("1. Drag the second clip (test2.mp4) from track 0 to track 1");
console.log("2. Ensure test2.mp4 moves, not test1.mp4");
console.log("3. Check that indices update correctly after move");