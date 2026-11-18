import ball1 from '../videos/ball1.wav?inline';
import ball2 from '../videos/ball2.mp3?inline';
import ball3 from '../videos/ball3.wav?inline';
import ball4 from '../videos/ball4.wav?inline';
import ball5 from '../videos/ball5.wav?inline';
import click from '../videos/optimized/click-responsive.wav?inline';
import month from '../videos/new_month.wav?inline';
import upgrade from '../videos/upgrade.wav?inline';

/** Build-time bytes only: no requests, markup, script execution or DOM sources. */
export const staticAudioData=Object.freeze({ball1,ball2,ball3,ball4,ball5,click,month,upgrade});
export type StaticAudioKey=keyof typeof staticAudioData;
