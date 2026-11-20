import {useEffect} from 'react';
import {installGymTemplateUnlocks} from '../platform/gymTemplateUnlocks';
import '../gameplay.css';
import './ComicDialog.css';
import '../contract.css';
import '../scheme-a.css';
import '../commerce.css';
import '../collection-album.css';
import '../career-dialogs.css';
import '../leaderboard.css';
import '../career-collection.css';
import '../player-tiers.css';
import '../fonts/typography.css';
import GymHome from './GymHome';

export default function GymEntry({startupAssetsReady}: {startupAssetsReady?:boolean}){
 useEffect(installGymTemplateUnlocks,[]);
 return <GymHome startupAssetsReady={startupAssetsReady}/>;
}
