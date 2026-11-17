`song.mp3`: *Nandana Sihina Gange* by Sangeeth Wijesuriya.

The game loops it between the points in `SONG_LOOP` (`src/config.ts`). If you replace the file,
re-measure them, e.g. with `ffmpeg -i song.mp3 -af silencedetect=noise=-50dB:d=0.05 -f null -`.
