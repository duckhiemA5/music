
import './style.css';

import { auth, db, storage } from './firebase.js';

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';

import {
  collection,
  addDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';

import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

// ========================================
// 1. KHỞI TẠO
// ========================================

const $ = (id) => document.getElementById(id);

const audio = $('audio-player');
const googleProvider = new GoogleAuthProvider();

let currentUser = null;
let tracks = [];
let visibleTracks = [];
let currentIndex = -1;
let authMode = 'login';
let activeView = 'home';
let botResults = [];
let activePlatform = null;

const favoritesKey = 'music-space-favorites';
const historyKey = 'music-space-history';

const readSet = (key) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
};

const saveSet = (key, value) => {
  localStorage.setItem(key, JSON.stringify([...value]));
};

let favorites = readSet(favoritesKey);
let history = readSet(historyKey);

// ========================================
// 2. TIỆN ÍCH
// ========================================

function toast(message, error = false) {
  const el = $('toast');
  if (!el) return;

  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');

  setTimeout(() => el.classList.remove('show'), 2800);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
}

function fmt(seconds) {
  return Number.isFinite(seconds)
    ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    : '0:00';
}

// ========================================
// 3. NHẬN DIỆN YOUTUBE VÀ SOUNDCLOUD
// ========================================

function getPlatform(url) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  // YouTube
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtu.be' ||
    host === 'music.youtube.com'
  ) {
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } else if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v') || '';
    } else {
      const match = parsed.pathname.match(
        /\/(embed|shorts|live)\/([^/?]+)/
      );

      if (match) videoId = match[2];
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      throw new Error('Không nhận diện được link YouTube.');
    }

    return {
      type: 'youtube',
      embed:
        `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&controls=1`
    };
  }

  // SoundCloud
  if (
    host === 'soundcloud.com' ||
    host === 'm.soundcloud.com' ||
    host === 'on.soundcloud.com'
  ) {
    return {
      type: 'soundcloud',
      embed:
        `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&hide_related=true&show_comments=false&show_user=true&visual=false`
    };
  }

  return null;
}

// ========================================
// 4. TRÌNH PHÁT YOUTUBE / SOUNDCLOUD
// ========================================

function openPlatform(track) {
  if (!track?.platform?.embed) {
    toast('Không tìm thấy trình phát của bài hát.', true);
    return;
  }

  activePlatform = track;

  const frame = document.createElement('iframe');

  frame.src = track.platform.embed;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture';
  frame.title = 'Music Space Audio Player';

  $('platform-frame').replaceChildren(frame);

  const dialog = $('platform-dialog');

  if (!dialog.open) {
    dialog.showModal();
  }

  $('play-button').textContent = 'Ⅱ';
}

function closePlatform() {
  const frame = $('platform-frame');

  if (frame) {
    frame.replaceChildren();
  }

  const dialog = $('platform-dialog');

  if (dialog?.open) {
    dialog.close();
  }

  activePlatform = null;
  $('play-button').textContent = '▶';
}

$('close-platform').addEventListener('click', closePlatform);

// ========================================
// 5. ĐĂNG NHẬP FIREBASE
// ========================================

function openAuth() {
  $('auth-error').textContent = '';
  $('auth-dialog').showModal();
}

function setAuthMode(mode) {
  authMode = mode;

  $('auth-title').textContent =
    mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';

  $('auth-submit').innerHTML =
    mode === 'login'
      ? 'Đăng nhập <span>→</span>'
      : 'Tạo tài khoản <span>→</span>';

  $('switch-auth').innerHTML =
    mode === 'login'
      ? 'Chưa có tài khoản? <button type="button">Tạo tài khoản</button>'
      : 'Đã có tài khoản? <button type="button">Đăng nhập</button>';
}

function authError(err) {
  const map = {
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
    'auth/user-not-found': 'Không tìm thấy tài khoản.',
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
    'auth/unauthorized-domain': 'Tên miền chưa được thêm trong Firebase Authentication.',
    'auth/operation-not-allowed': 'Hãy bật Email/Password trong Firebase Authentication.',
    'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ Google.'
  };

  return map[err.code] || err.message;
}

$('auth-button').addEventListener('click', openAuth);
$('top-auth').addEventListener('click', openAuth);

document.querySelector('.dialog-close').addEventListener('click', (e) => {
  e.preventDefault();
  $('auth-dialog').close();
});

$('switch-auth').addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;

  try {
    if (authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }

    $('auth-dialog').close();

    toast(
      authMode === 'login'
        ? 'Đăng nhập thành công!'
        : 'Tạo tài khoản thành công!'
    );

  } catch (err) {
    $('auth-error').textContent = authError(err);
  }
});

$('google-login-button').addEventListener('click', async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);

    $('auth-dialog').close();

    toast(`Xin chào ${result.user.displayName || result.user.email}!`);

  } catch (err) {
    $('auth-error').textContent = authError(err);
    console.error(err);
  }
});

$('logout-button').addEventListener('click', async () => {
  try {
    await signOut(auth);
    toast('Đã đăng xuất.');
  } catch (err) {
    toast('Đăng xuất thất bại: ' + err.message, true);
  }
});

// ========================================
// 6. THEO DÕI TÀI KHOẢN
// ========================================

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  $('user-label').textContent =
    user?.displayName || user?.email?.split('@')[0] || 'Khách';

  $('auth-label').textContent =
    user ? 'Đã đăng nhập' : 'Chưa đăng nhập';

  $('avatar').textContent =
    (user?.displayName || user?.email || 'G')
      .charAt(0)
      .toUpperCase();

  $('auth-button').hidden = !!user;
  $('top-auth').hidden = !!user;
  $('logout-button').hidden = !user;

  // Khách và người đăng nhập đều xem được thư viện
  await loadTracks();
});

// ========================================
// 7. TẢI THƯ VIỆN NHẠC
// ========================================

async function loadTracks() {
  try {
    console.log('Đang tải thư viện nhạc...');

    const snapshot = await getDocs(collection(db, 'tracks'));

    console.log('Số bài hát tìm thấy:', snapshot.size);

    tracks = snapshot.docs.map(doc => {
      const data = doc.data();

      // Chuẩn hóa dữ liệu để tránh undefined
      const platform = data.platform
        ? {
            type: data.platform.type || data.source || 'link',
            embed: data.platform.embed || ''
          }
        : null;

      return {
        id: doc.id,
        title: data.title || 'Không có tên bài hát',
        artist: data.artist || 'Unknown Artist',
        url: data.url || '',
        source: data.source || 'upload',
        userId: data.userId || '',
        createdAt: data.createdAt || null,
        platform
      };
    });

    renderTracks();

    console.log('Đã tải thư viện thành công!');

  } catch (error) {
    console.error('LỖI TẢI THƯ VIỆN:', error);

    $('track-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">!</div>
        <b>Không tải được thư viện</b>
        <p>Vui lòng kiểm tra kết nối và Firestore Rules.</p>
      </div>
    `;

    toast(
      'Lỗi: ' + (error.code || 'unknown') + ' - ' + error.message,
      true
    );
  }
}

// ========================================
// 8. LỌC VÀ HIỂN THỊ BÀI HÁT
// ========================================

function currentList() {
  if (activeView === 'favorites') {
    return tracks.filter(t => favorites.has(t.id));
  }

  if (activeView === 'history') {
    return tracks.filter(t => history.has(t.id));
  }

  return tracks;
}

function renderTracks() {
  const list = currentList();

  visibleTracks = list;

  $('library-title').textContent =
    activeView === 'favorites'
      ? 'Bài hát yêu thích'
      : activeView === 'history'
        ? 'Đã nghe gần đây'
        : activeView === 'library'
          ? 'Toàn bộ thư viện'
          : 'Thư viện nhạc chung';

  if (!list.length) {
    $('track-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">♫</div>
        <b>Chưa có bài hát nào</b>
        <p>Hãy thêm nhạc để xây dựng thư viện Music Space.</p>
        <button class="outline-button" data-goto="add">
          ＋ Thêm nhạc
        </button>
      </div>
    `;

    $('track-list')
      .querySelector('[data-goto]')
      ?.addEventListener('click', () => changeView('add'));

    return;
  }

  $('track-list').innerHTML = list.map((t) => `
    <div class="track-row">
      <button class="track-play" data-play="${esc(t.id)}">▶</button>

      <div class="track-cover">♫</div>

      <div class="track-info">
        <b>${esc(t.title || 'Không tên')}</b>
        <small>${esc(t.artist || 'Unknown Artist')}</small>
      </div>

      <span class="track-source">
        ${
          t.platform
            ? esc(String(t.platform.type || t.source || 'LINK').toUpperCase())
            : t.source === 'bot'
              ? 'PREVIEW'
              : t.source === 'url'
                ? 'ONLINE'
                : 'MY MUSIC'
        }
      </span>

      <button
        class="track-like ${favorites.has(t.id) ? 'liked' : ''}"
        data-like="${esc(t.id)}"
      >
        ${favorites.has(t.id) ? '♥' : '♡'}
      </button>
    </div>
  `).join('');

  $('track-list')
    .querySelectorAll('[data-play]')
    .forEach(b => {
      b.addEventListener('click', () => playTrack(b.dataset.play));
    });

  $('track-list')
    .querySelectorAll('[data-like]')
    .forEach(b => {
      b.addEventListener('click', () => toggleFavorite(b.dataset.like));
    });
}

// ========================================
// 9. YÊU THÍCH
// ========================================

function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }

  saveSet(favoritesKey, favorites);
  renderTracks();
}

// ========================================
// 10. PHÁT NHẠC
// ========================================

function playTrack(id) {
  const list = currentList();

  const index = list.findIndex(t => t.id === id);

  if (index < 0) return;

  currentIndex = index;

  const t = list[index];

  $('now-title').textContent = t.title || 'Không tên';
  $('now-artist').textContent = t.artist || 'Unknown Artist';
  $('player-cover').textContent = '♫';

  history.add(id);
  saveSet(historyKey, history);

  // Nếu là YouTube hoặc SoundCloud có trình phát hợp lệ
  if (t.platform?.embed) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    openPlatform(t);
    renderTracks();

    return;
  }

  // Nếu là MP3 hoặc file âm thanh trực tiếp
  closePlatform();

  if (!t.url) {
    toast('Bài hát chưa có đường dẫn âm thanh.', true);
    return;
  }

  audio.src = t.url;

  audio.play()
    .then(() => {
      $('play-button').textContent = 'Ⅱ';
    })
    .catch(err => {
      console.error(err);
      toast('Không phát được file này. Kiểm tra URL hoặc quyền truy cập.', true);
    });

  renderTracks();
}

// ========================================
// 11. ĐIỀU KHIỂN TRÌNH PHÁT
// ========================================

$('play-button').addEventListener('click', () => {
  if (activePlatform) {
    if ($('platform-dialog').open) {
      closePlatform();
    } else {
      openPlatform(activePlatform);
    }

    return;
  }

  if (!audio.src) {
    toast('Hãy chọn một bài hát trước.');
    return;
  }

  if (audio.paused) {
    audio.play()
      .then(() => {
        $('play-button').textContent = 'Ⅱ';
      })
      .catch(() => toast('Không phát được nhạc.', true));

  } else {
    audio.pause();
    $('play-button').textContent = '▶';
  }
});

audio.addEventListener('play', () => {
  $('play-button').textContent = 'Ⅱ';
});

audio.addEventListener('pause', () => {
  $('play-button').textContent = '▶';
});

audio.addEventListener('ended', () => {
  $('play-button').textContent = '▶';
});

audio.addEventListener('timeupdate', () => {
  $('current-time').textContent = fmt(audio.currentTime);
  $('duration').textContent = fmt(audio.duration);

  if (audio.duration) {
    $('seek-bar').value =
      audio.currentTime / audio.duration * 100;
  }
});

audio.addEventListener('loadedmetadata', () => {
  $('duration').textContent = fmt(audio.duration);
});

$('seek-bar').addEventListener('input', (e) => {
  if (audio.duration) {
    audio.currentTime =
      Number(e.target.value) / 100 * audio.duration;
  }
});

$('volume-bar').addEventListener('input', (e) => {
  audio.volume = Number(e.target.value);

  $('volume-value').textContent =
    `${Math.round(audio.volume * 100)}%`;
});

audio.volume = 0.8;

$('prev-button').addEventListener('click', () => stepTrack(-1));
$('next-button').addEventListener('click', () => stepTrack(1));

function stepTrack(delta) {
  const list = currentList();

  if (!list.length) return;

  const next =
    currentIndex < 0
      ? 0
      : (currentIndex + delta + list.length) % list.length;

  playTrack(list[next].id);
}

$('like-button').addEventListener('click', () => {
  const t = currentList()[currentIndex];

  if (t) {
    toggleFavorite(t.id);
  }
});

// ========================================
// 12. MUSIC SEARCH BOT - ITUNES API
// ========================================

async function searchBot() {
  const term = $('search-input').value.trim();

  if (!term) {
    toast('Nhập tên bài hát hoặc nghệ sĩ.');
    return;
  }

  $('search-hint').textContent = 'Bot đang tìm nhạc...';

  $('bot-results').innerHTML =
    '<div class="empty-state">Đang tìm kiếm...</div>';

  try {
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=12`
    );

    if (!response.ok) {
      throw new Error('Dịch vụ tìm kiếm đang bận.');
    }

    const data = await response.json();

    botResults = data.results || [];

    $('search-hint').textContent =
      `Tìm thấy ${botResults.length} kết quả cho “${term}”. Nhấn Phát thử để nghe preview.`;

    $('bot-results').innerHTML = botResults.length
      ? botResults.map((t, i) => `
          <div class="track-row bot-track">
            <div class="track-cover">♫</div>

            <div class="track-info">
              <b>${esc(t.trackName)}</b>
              <small>
                ${esc(t.artistName)} · ${esc(t.collectionName || '')}
              </small>
            </div>

            <button
              class="outline-button"
              data-preview="${i}"
              ${t.previewUrl ? '' : 'disabled'}
            >
              ▶ Nghe thử
            </button>
          </div>
        `).join('')
      : '<div class="empty-state">Không tìm thấy kết quả. Thử từ khóa khác nhé.</div>';

    $('bot-results')
      .querySelectorAll('[data-preview]')
      .forEach(b => {
        b.addEventListener('click', () => {
          playPreview(Number(b.dataset.preview));
        });
      });

  } catch (err) {
    $('search-hint').textContent = err.message;
    $('bot-results').innerHTML = '';

    toast('Không thể tìm nhạc lúc này.', true);
  }
}

function playPreview(index) {
  const t = botResults[index];

  if (!t?.previewUrl) return;

  closePlatform();

  audio.src = t.previewUrl;

  audio.play()
    .then(() => {
      $('play-button').textContent = 'Ⅱ';
    })
    .catch(() => toast('Không phát được preview.', true));

  $('now-title').textContent = t.trackName || 'Không tên';
  $('now-artist').textContent = `${t.artistName || 'Unknown Artist'} · Preview`;
}

$('search-button').addEventListener('click', searchBot);

$('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    searchBot();
  }
});

// ========================================
// 13. CHUYỂN TRANG
// ========================================

function changeView(view) {
  activeView = view;

  document.querySelectorAll('.nav-item[data-view]')
    .forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

  $('page-name').textContent = ({
    home: 'Khám phá',
    library: 'Thư viện nhạc',
    add: 'Thêm nhạc',
    favorites: 'Yêu thích',
    history: 'Đã nghe gần đây'
  })[view] || 'Music Space';

  $('hero-section').classList.toggle('hidden', view !== 'home');
  $('search-section').classList.toggle('hidden', view !== 'home');
  $('library-section').classList.toggle('hidden', view === 'add');
  $('add-section').classList.toggle('hidden', view !== 'add');

  renderTracks();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

document.querySelectorAll('.nav-item[data-view]')
  .forEach(b => {
    b.addEventListener('click', () => {
      changeView(b.dataset.view);
    });
  });

$('explore-button').addEventListener('click', () => {
  changeView('library');
});

$('view-all').addEventListener('click', () => {
  changeView('library');
});

$('empty-add')?.addEventListener('click', () => {
  changeView('add');
});

// ========================================
// 14. CHỌN FILE ÂM THANH
// ========================================

$('audio-file').addEventListener('change', (e) => {
  const file = e.target.files[0];

  $('file-picked').textContent = file
    ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`
    : 'Chưa chọn file';

  if (file && !$('file-title').value) {
    $('file-title').value =
      file.name.replace(/\.[^.]+$/, '');
  }
});

// ========================================
// 15. TẢI NHẠC LÊN FIREBASE STORAGE
// ========================================

$('upload-button').addEventListener('click', async () => {
  const file = $('audio-file').files[0];

  if (!currentUser) {
    toast('Đăng nhập trước khi tải nhạc.');
    openAuth();
    return;
  }

  if (!file) {
    toast('Chọn file âm thanh trước.');
    return;
  }

  if (!file.type.startsWith('audio/')) {
    toast('File đã chọn không phải âm thanh.', true);
    return;
  }

  try {
    $('upload-progress').classList.remove('hidden');
    $('progress-label').textContent = 'Đang tải lên...';

    const safe = file.name.replace(/[^\w.\-]/g, '_');

    const path =
      `music/${currentUser.uid}/${Date.now()}_${safe}`;

    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file);

    const url = await getDownloadURL(storageRef);

    await addDoc(collection(db, 'tracks'), {
      userId: currentUser.uid,
      title: $('file-title').value.trim() || file.name,
      artist: $('file-artist').value.trim() || 'Unknown Artist',
      url,
      source: 'upload',
      createdAt: serverTimestamp()
    });

    $('progress-label').textContent = 'Hoàn tất!';

    $('audio-file').value = '';
    $('file-picked').textContent = 'Chưa chọn file';
    $('file-title').value = '';
    $('file-artist').value = '';

    toast('Đã tải nhạc lên thành công!');

    await loadTracks();

  } catch (err) {
    console.error(err);

    $('progress-label').textContent = authError(err);

    toast('Tải lên thất bại: ' + err.message, true);
  }
});

// ========================================
// 16. THÊM LINK YOUTUBE / SOUNDCLOUD / MP3
// ========================================

$('add-url-button').addEventListener('click', async () => {
  if (!currentUser) {
    toast('Đăng nhập trước khi thêm nhạc.');
    openAuth();
    return;
  }

  const url = $('web-url').value.trim();
  const title = $('web-title').value.trim();
  const artist = $('web-artist').value.trim() || 'Unknown Artist';

  if (!url || !title) {
    toast('Nhập URL và tên bài hát.');
    return;
  }

  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('URL không hợp lệ.');
    }

    const platform = getPlatform(url);

    const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)(\?|#|$)/i
      .test(parsed.pathname + parsed.search + parsed.hash);

    if (!platform && !isAudio) {
      throw new Error(
        'Chỉ hỗ trợ link YouTube, SoundCloud hoặc file âm thanh trực tiếp.'
      );
    }

    const track = {
      userId: currentUser.uid,
      title,
      artist,
      url,
      source: platform ? platform.type : 'url',
      createdAt: serverTimestamp()
    };

    if (platform) {
      track.platform = platform;
    }

    await addDoc(collection(db, 'tracks'), track);

    $('web-url').value = '';
    $('web-title').value = '';
    $('web-artist').value = '';

    toast('Đã thêm nhạc vào thư viện!');

    await loadTracks();

  } catch (err) {
    console.error(err);

    toast('Không thể thêm URL: ' + err.message, true);
  }
});

// ========================================
// 17. KHỞI ĐỘNG MUSIC SPACE
// ========================================

$('logout-button').hidden = true;

setAuthMode('login');

changeView('home');
// ANNOUNCEMENT POPUP
const announcement = document.getElementById('announcement-overlay');
const closeAnnouncement = document.getElementById('close-announcement');
const confirmAnnouncement = document.getElementById('confirm-announcement');

function hideAnnouncement() {
    announcement.style.display = 'none';
}

closeAnnouncement.addEventListener('click', hideAnnouncement);
confirmAnnouncement.addEventListener('click', hideAnnouncement);