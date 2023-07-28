import Sortable from 'sortablejs';
import Player, { RepeatMode } from './player';
import Producer from './producer';
import { DEFAULT_OUTPUTPARAMS, HIDDEN_SIZE, OutputParams } from './params';
import { decompress, randn } from './helper';
import { decode } from './api';

const player = new Player();

// check if local storage is available
let localStorageAvailable = false;
try {
  const x = '__storage_test__';
  window.localStorage.setItem(x, x);
  window.localStorage.removeItem(x);
  localStorageAvailable = true;
} catch (e) {
  console.log('Local storage is unavailable');
}

// try to load playlist from local storage
let playlistToLoad: OutputParams[] = [];
if (localStorageAvailable) {
  const localStoragePlaylist = localStorage.getItem('playlist');
  if (localStoragePlaylist) {
    try {
      playlistToLoad = JSON.parse(localStoragePlaylist);
    } catch (e) {
      console.log('Error parsing', localStoragePlaylist);
    }
  }
}
const updateLocalStorage = () => {
  if (localStorageAvailable) {
    localStorage.setItem('playlist', JSON.stringify(player.playlist.map((t) => t.outputParams)));
  }
};
player.updateLocalStorage = updateLocalStorage;

// load playlist in URL if possible
const queryString = window.location.search;
if (queryString.length > 0) {
  const compressedPlaylist = queryString === '?default' ? DEFAULT_OUTPUTPARAMS : queryString.substring(1);
  try {
    const decompressed = decompress(compressedPlaylist);
    const outputParams: OutputParams[] = JSON.parse(decompressed);
    playlistToLoad = [
      ...playlistToLoad.filter((p) => outputParams.every((p2) => p2.title !== p.title)),
      ...outputParams
    ];
    window.history.pushState({}, null, window.location.href.split('?')[0]);
  } catch (e) {
    console.log('Error parsing', compressedPlaylist);
  }
}

if (playlistToLoad.length > 0) {
  const playlist = playlistToLoad.map((params) => {
    const producer = new Producer();
    return producer.produce(params);
  });
  player.playlist = playlist;
  updateLocalStorage();
}

// Generate button
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
export async function generateNewTrack(numberArray?: number[]) {
  generateButton.disabled = true;

  if (!numberArray)
    numberArray = [...new Array(100)].map(() => randn());

  let params;
  try {
    params = await decode(numberArray);
  } catch (err) {
    generateButton.textContent = 'Error!';
    return;
  }
  const producer = new Producer();
  const track = producer.produce(params);
  player.addToPlaylist(track);

  generateButton.disabled = false;
}

generateButton.addEventListener('click', e => { generateNewTrack(); });

/** Formats seconds into an MM:SS string */
const formatTime = (seconds: number) => {
  if (!seconds || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${`0${Math.floor(seconds % 60)}`.slice(-2)}`;
};

// Seekbar
const seekbar = document.getElementById('seekbar') as HTMLInputElement;
seekbar.addEventListener('input', () => {
  //timeLabel.textContent = formatTime(seekbar.valueAsNumber);
  formatInputRange(seekbar, '#fc5c8c');
});
let wasPaused = false;
let seekbarDragging = false;
['mousedown', 'touchstart'].forEach((e) => seekbar.addEventListener(e, () => {
  seekbarDragging = true;
  wasPaused = !player.isPlaying;
  if (!wasPaused) {
    player.pause();
  }
}));
['mouseup', 'touchend'].forEach((e) => seekbar.addEventListener(e, () => {
  seekbarDragging = false;
  player.seek(seekbar.valueAsNumber);
  if (!wasPaused) {
    player.play();
  }
}));

// Track details and time
const audio = document.getElementById('audio') as HTMLAudioElement; // dummy audio for Media Session API
const formatInputRange = (input: HTMLInputElement, color: string) => {
  const value = ((input.valueAsNumber - +input.min) / (+input.max - +input.min)) * 100;
  if (!value) {
    input.style.background = 'rgba(0, 0, 0, 0.25)';
  }
  input.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${value}%, rgba(0, 0, 0, 0.25) ${value}%, rgba(0, 0, 0, 0.25) 100%)`;
};
player.updateTrackDisplay = (seconds?: number, spectrum?: Float32Array) => {
  // don't update display while seekbar is being dragged
  if (seekbarDragging) return;

  if (player.currentTrack) {
    const totalLength = player.currentTrack.length;
    seekbar.max = `${totalLength}`;
    seekbar.valueAsNumber = +seconds;
  } else {
    seekbar.valueAsNumber = 0;
    seekbar.max = '0';
  }
  formatInputRange(seekbar, '#fc5c8c');
};

player.onTrackChange = () => { };
player.updatePlaylistDisplay = function () {
  player.playlist.forEach((track, i) => {
    console.log(track.outputParams);
    let id = 'track-' + track.title.substring(1);
    if (document.getElementById(id))
      return;
    let el = document.createElement('div');
    el.setAttribute('id', id);
    el.classList.add('track');
    el.setAttribute('title', track.title);
    el.innerHTML = document.querySelector('#template-track').innerHTML;
    el.style.background = track.gradient;

    el.querySelector('.remove-button').addEventListener('click', e => {
      player.deleteTrack(track);
      el.remove();
    });

    el.querySelector('.play-button').addEventListener('click', e => {
      player.playTrack(track);
    });

    el.querySelector('.variant-button').addEventListener('click', e => {
      let params = [...track.outputParams.inputList].map(n => n + 0.5 * randn());
      generateNewTrack(params);
    });

    document.querySelector('#tracks-container').appendChild(el);
  });
  console.log(player);
};

player.updatePlaylistDisplay();

// Player controls
const playButton = document.getElementById('play-button');

const volume = 0.5;
player.getGain = () => volume;
const updatePlayingState = () => {
  playButton.innerHTML = player.isPlaying ? '| |' : '▶';
  if (player.isPlaying) {
    audio.play();
  } else {
    audio.pause();
  }
};
player.onPlayingStateChange = updatePlayingState;
player.onLoadingStateChange = () => { };
playButton.addEventListener('click', async () => {
  if (player.playlist.length === 0) return;

  if (player.isPlaying) {
    player.pause();
  } else {
    player.play();
    if (!player.muted) {
      player.gain.gain.value = volume;
    }
  }
});

// Media Session API
const actionsAndHandlers = [
  ['play', () => { player.play(); }],
  ['pause', () => { player.pause(); }],
  ['previoustrack', () => { player.playPrevious(); }],
  ['nexttrack', () => { player.playNext(); }],
  ['seekbackward', (details: MediaSessionActionDetails) => { player.seekRelative(-5); }],
  ['seekforward', (details: MediaSessionActionDetails) => { player.seekRelative(5); }],
  ['seekto', (details: MediaSessionActionDetails) => { player.seek(details.seekTime); }],
  ['stop', () => { player.unload(); }]
];
for (const [action, handler] of actionsAndHandlers) {
  try {
    navigator.mediaSession.setActionHandler(action as any, handler as any);
  } catch (error) {
    console.log(`The media session action ${action}, is not supported`);
  }
}
