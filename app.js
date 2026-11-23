// ============================================================================
// 세계문학전집 (World Literature App) - Core App Logic
// 매일 새로운 책들 자동 갱신(데일리 큐레이션), 실제 출판사 표지, 필터, 북마크, 오디오
// ============================================================================

// 애플리케이션 상태 관리
const state = {
  currentFilter: 'daily', // 'daily', 'all', '민음사', '열린책들', '문학동네', 또는 카테고리명
  dailyBooks: [],         // 오늘 날짜 전용 큐레이션 도서 (7권)
  filteredBooks: [],      // 현재 화면에 표시할 도서 배열
  currentIndex: 0,
  bookmarks: JSON.parse(localStorage.getItem('worldbooks_bookmarks') || '[]'),
  currentTheme: localStorage.getItem('worldbooks_theme') || 'parchment',
  fontSizeLevel: parseInt(localStorage.getItem('worldbooks_fontsize') || '1'), // 0: 작게, 1: 보통, 2: 크게
  soundEnabled: localStorage.getItem('worldbooks_sound') === 'true',
  currentDateKey: '',
  searchQuery: '',
  // 터치 제스처 좌표
  touchStartX: 0,
  touchEndX: 0,
  touchStartY: 0,
  touchEndY: 0
};

// ----------------------------------------------------------------------------
// [1] 날짜 기반 시드(Seed) 난수 생성기 & 매일 새로운 7권 데일리 큐레이션 알고리즘
// ----------------------------------------------------------------------------

// Mulberry32 알고리즘: 동일한 날짜에는 항상 동일한 책 세트가 선별되며, 다음 날 자정에는 완전히 새로운 책들이 산출됨
function seededRandom(seed) {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// 오늘 날짜 숫자 시드 생성 (예: 20261123)
function getTodayDateSeed(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return y * 10000 + m * 100 + day;
}

// 오늘 날짜 문자열 키 (예: "2026-11-23")
function getTodayDateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 매일 균형 있게 7권의 세계문학 추천작 생성 (민음사 3권, 열린책들 2권, 문학동네/기타 2권 + 다양한 카테고리 안배)
function generateDailyBooks() {
  const dateSeed = getTodayDateSeed();
  state.currentDateKey = getTodayDateKey();

  let currentSeed = dateSeed;
  const dailySet = [];

  // 출판사별 분배
  const publishers = [
    { name: "민음사", count: 3 },
    { name: "열린책들", count: 2 },
    { name: "문학동네", count: 2 }
  ];

  publishers.forEach((pub, pIdx) => {
    let pool = WORLD_BOOKS.filter(b => b.publisher === pub.name);
    if (pool.length < pub.count) {
      pool = WORLD_BOOKS;
    }

    // 시드 기반 셔플을 위한 인덱스 배열
    const indices = pool.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      currentSeed += (pIdx + 1) * 37;
      const r = Math.floor(seededRandom(currentSeed) * (i + 1));
      [indices[i], indices[r]] = [indices[r], indices[i]];
    }

    for (let k = 0; k < pub.count && k < indices.length; k++) {
      const selected = pool[indices[k]];
      if (!dailySet.some(b => b.id === selected.id)) {
        dailySet.push(selected);
      }
    }
  });

  // 부족할 경우 전체 풀에서 보충
  if (dailySet.length < 7) {
    const remaining = WORLD_BOOKS.filter(b => !dailySet.some(s => s.id === b.id));
    for (let i = 0; i < remaining.length && dailySet.length < 7; i++) {
      dailySet.push(remaining[i]);
    }
  }

  // 매일 추천 순서 최종 셔플
  for (let i = dailySet.length - 1; i > 0; i--) {
    currentSeed += 19;
    const r = Math.floor(seededRandom(currentSeed) * (i + 1));
    [dailySet[i], dailySet[r]] = [dailySet[r], dailySet[i]];
  }

  return dailySet;
}

// ----------------------------------------------------------------------------
// [2] 사운드 및 오디오 피드백 (Web Audio API)
// ----------------------------------------------------------------------------

function playPaperTurnSound() {
  if (!state.soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // 부드러운 책장 넘김 감성의 핑크 노이즈 & 은은한 차임 화음
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.18); // E5

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.log("Audio waiting for user interaction");
  }
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('worldbooks_sound', state.soundEnabled);
  updateSoundButtonUI();
  showToast(state.soundEnabled ? '🔔 효과음이 켜졌습니다.' : '🔕 효과음이 꺼졌습니다.');
}

function updateSoundButtonUI() {
  const btn = document.getElementById('soundBtn');
  if (!btn) return;
  if (state.soundEnabled) {
    btn.classList.add('text-amber-700', 'dark:text-amber-400');
    btn.title = '효과음 끄기';
  } else {
    btn.classList.remove('text-amber-700', 'dark:text-amber-400');
    btn.title = '효과음 켜기';
  }
}

// ----------------------------------------------------------------------------
// [3] 테마 및 글자 크기 관리
// ----------------------------------------------------------------------------

function applyTheme(theme) {
  state.currentTheme = theme;
  localStorage.setItem('worldbooks_theme', theme);
  const root = document.documentElement;
  root.classList.remove('theme-parchment', 'theme-dark', 'theme-slate');
  root.classList.add(`theme-${theme}`);
}

function cycleTheme() {
  const themes = ['parchment', 'dark', 'slate'];
  const nextIdx = (themes.indexOf(state.currentTheme) + 1) % themes.length;
  applyTheme(themes[nextIdx]);

  const names = {
    parchment: '📜 양장본 파피루스 테마',
    dark: '🌑 미드나잇 다크 테마',
    slate: '🕊️ 새벽 슬레이트 테마'
  };
  showToast(names[themes[nextIdx]]);
}

function applyFontSize(level) {
  state.fontSizeLevel = level;
  localStorage.setItem('worldbooks_fontsize', level);
  const body = document.getElementById('cardScrollBody');
  if (!body) return;
  body.classList.remove('text-size-sm', 'text-size-base', 'text-size-lg');
  if (level === 0) body.classList.add('text-size-sm');
  else if (level === 2) body.classList.add('text-size-lg');
  else body.classList.add('text-size-base');
}

function cycleFontSize() {
  const nextLevel = (state.fontSizeLevel + 1) % 3;
  applyFontSize(nextLevel);
  const labels = ['작게', '보통', '크게'];
  showToast(`글자 크기: ${labels[nextLevel]}`);
}

// ----------------------------------------------------------------------------
// [4] 필터링 및 도서 목록 갱신
// ----------------------------------------------------------------------------

function setFilter(filterKey) {
  state.currentFilter = filterKey;
  state.currentIndex = 0;

  if (filterKey === 'daily') {
    state.filteredBooks = [...state.dailyBooks];
  } else if (filterKey === 'all') {
    state.filteredBooks = [...WORLD_BOOKS];
  } else if (['민음사', '열린책들', '문학동네'].includes(filterKey)) {
    state.filteredBooks = WORLD_BOOKS.filter(b => b.publisher === filterKey);
  } else {
    // 카테고리 필터
    state.filteredBooks = WORLD_BOOKS.filter(b => b.category.includes(filterKey) || b.tags.some(t => t.includes(filterKey)));
  }

  // 필터 버튼 활성화 UI 갱신
  document.querySelectorAll('.filter-chip').forEach(btn => {
    if (btn.getAttribute('data-filter') === filterKey) {
      btn.classList.add('active-filter');
    } else {
      btn.classList.remove('active-filter');
    }
  });

  // 모드 배지 갱신
  updateModeIndicator();
  renderBook(0, 'fade');
}

function updateModeIndicator() {
  const badge = document.getElementById('modeIndicatorBadge');
  const countSpan = document.getElementById('libraryCountDisplay');
  if (!badge) return;

  if (state.currentFilter === 'daily') {
    badge.innerHTML = `✨ <b>오늘의 7선</b> (매일 자정 자동 갱신)`;
    badge.className = 'text-[11px] font-semibold tracking-tight px-2.5 py-0.5 rounded-md mode-badge-daily';
  } else if (state.currentFilter === 'all') {
    badge.innerHTML = `📚 <b>전체 서재</b> (${WORLD_BOOKS.length}선)`;
    badge.className = 'text-[11px] font-semibold tracking-tight px-2.5 py-0.5 rounded-md mode-badge-all';
  } else if (['민음사', '열린책들', '문학동네'].includes(state.currentFilter)) {
    badge.innerHTML = `🏛️ <b>${state.currentFilter} 세계문학</b> (${state.filteredBooks.length}선)`;
    badge.className = 'text-[11px] font-semibold tracking-tight px-2.5 py-0.5 rounded-md mode-badge-pub';
  } else {
    badge.innerHTML = `🏷️ <b>${state.currentFilter}</b> (${state.filteredBooks.length}선)`;
    badge.className = 'text-[11px] font-semibold tracking-tight px-2.5 py-0.5 rounded-md mode-badge-cat';
  }

  if (countSpan) {
    countSpan.textContent = `총 ${WORLD_BOOKS.length}권 소장`;
  }
}

function updateFilterChipCounts() {
  const total = WORLD_BOOKS.length;
  const minumsaCount = WORLD_BOOKS.filter(b => b.publisher === '민음사').length;
  const openbooksCount = WORLD_BOOKS.filter(b => b.publisher === '열린책들').length;
  const munhakCount = WORLD_BOOKS.filter(b => b.publisher === '문학동네').length;

  document.querySelectorAll('.filter-chip').forEach(btn => {
    const f = btn.getAttribute('data-filter');
    if (f === 'all') btn.textContent = `📚 전체 서재 (${total})`;
    else if (f === '민음사') btn.textContent = `🏛️ 민음사 (${minumsaCount})`;
    else if (f === '열린책들') btn.textContent = `📖 열린책들 (${openbooksCount})`;
    else if (f === '문학동네') btn.textContent = `🌿 문학동네 (${munhakCount})`;
    else if (f === 'daily') btn.textContent = `✨ 오늘의 7선`;
  });

  const libraryCountDisplay = document.getElementById('libraryCountDisplay');
  if (libraryCountDisplay) {
    libraryCountDisplay.textContent = `총 ${total}권 소장`;
  }
}

// ----------------------------------------------------------------------------
// [5] 메인 도서 카드 렌더링 & 표지 이미지 처리
// ----------------------------------------------------------------------------

function renderBook(index, animation = 'none') {
  if (state.filteredBooks.length === 0) {
    renderEmptyState();
    return;
  }

  // 인덱스 범위 보정
  if (index < 0) index = state.filteredBooks.length - 1;
  if (index >= state.filteredBooks.length) index = 0;
  state.currentIndex = index;

  const book = state.filteredBooks[index];
  const card = document.getElementById('bookCard');

  // 애니메이션 클래스 제어
  card.classList.remove('slide-in-right', 'slide-in-left', 'fade-in');
  if (animation === 'right') card.classList.add('slide-in-right');
  else if (animation === 'left') card.classList.add('slide-in-left');
  else if (animation === 'fade') card.classList.add('fade-in');

  // 스크롤 본문 맨 위로 리셋
  const scrollBody = document.getElementById('cardScrollBody');
  if (scrollBody) scrollBody.scrollTop = 0;

  // 상단 메타 바
  document.getElementById('cardPublisherBadge').textContent = book.series || book.publisher;
  document.getElementById('cardCategoryBadge').textContent = book.category;
  document.getElementById('pageIndicator').textContent = `${index + 1} / ${state.filteredBooks.length}`;

  // 표지 이미지 렌더링
  const coverImg = document.getElementById('cardBookCover');
  const coverPlaceholder = document.getElementById('cardCoverPlaceholder');
  if (coverImg) {
    coverImg.alt = `${book.title} 표지 - ${book.publisher}`;
    coverImg.style.display = 'block';
    if (coverPlaceholder) coverPlaceholder.style.display = 'none';

    coverImg.src = book.coverUrl;
    coverImg.onerror = function() {
      // 실제 교보문고 표지 이미지가 실패할 경우, 미려한 출판사별 맞춤 CSS 그래픽 표지로 우아하게 대체
      handleCoverError(this, book);
    };
  }

  // 도서 기본 서지 정보
  document.getElementById('cardTitle').textContent = book.title;
  document.getElementById('cardTitleEn').textContent = book.titleEn;
  document.getElementById('cardAuthor').textContent = `${book.author} 지음`;
  document.getElementById('cardTranslator').textContent = book.translator ? `· ${book.translator} 옮김` : '';
  document.getElementById('cardCountryEra').textContent = `${book.country} · ${book.era}`;

  // 평점 및 리뷰 수
  const starIcons = renderStarRating(book.rating);
  document.getElementById('cardStarsContainer').innerHTML = starIcons;
  document.getElementById('cardRatingScore').textContent = book.rating.toFixed(1);
  document.getElementById('cardReviewsCount').textContent = `(${book.reviewsCount})`;

  // 태그 목록
  const tagsContainer = document.getElementById('cardTagsContainer');
  tagsContainer.innerHTML = '';
  book.tags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'text-[11px] px-2 py-0.5 rounded-md font-medium book-tag-item';
    span.textContent = tag;
    tagsContainer.appendChild(span);
  });

  // 핵심 줄거리
  document.getElementById('cardPlot').textContent = book.plot;

  // 작품의 핵심 주제 & 의의
  document.getElementById('cardTheme').textContent = book.theme;

  // 대표 명문장
  document.getElementById('cardQuote').textContent = `"${book.quote}"`;

  // 오늘의 독서 화두 & 생각거리
  document.getElementById('cardReadingPoint').textContent = book.readingPoint;

  // 도서 스펙
  document.getElementById('cardPageCount').textContent = book.pageCount;
  document.getElementById('cardIsbn').textContent = book.isbn;
  
  // 교보문고 구매/상세 링크
  const buyBtn = document.getElementById('cardKyoboLink');
  if (buyBtn) {
    buyBtn.href = book.kyoboUrl || `https://search.kyobobook.co.kr/search?keyword=${encodeURIComponent(book.title + ' ' + book.publisher)}`;
  }

  // 북마크 별표 상태 갱신
  updateBookmarkIcon();

  // 하단 진행 프로그레스 바 갱신
  updateProgressBar();
}

// 별점 렌더링 헬퍼 (SVG 채움 별)
function renderStarRating(score) {
  let starsHtml = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(score)) {
      starsHtml += `<svg class="w-3.5 h-3.5 text-amber-500 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    } else if (i - score <= 0.5) {
      starsHtml += `<svg class="w-3.5 h-3.5 text-amber-500 fill-current opacity-80" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    } else {
      starsHtml += `<svg class="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`;
    }
  }
  return starsHtml;
}

// 오프라인 혹은 이미지 오류 시 출판사 감성 그래픽 대체 표지 렌더러
function handleCoverError(imgElement, book) {
  imgElement.style.display = 'none';
  const placeholder = document.getElementById('cardCoverPlaceholder');
  if (!placeholder) return;

  placeholder.style.display = 'flex';
  const pubMeta = PUBLISHER_META[book.publisher] || PUBLISHER_META["전체"];

  // 민음사 고유의 미색 프레임 + 중앙 명화 감성 레이아웃 재현
  let pubColor = '#8B263E';
  if (book.publisher === '열린책들') pubColor = '#2F5233';
  if (book.publisher === '문학동네') pubColor = '#1E3D59';

  placeholder.innerHTML = `
    <div class="w-full h-full p-2.5 flex flex-col justify-between rounded-lg shadow-inner text-center select-none" style="background: linear-gradient(145deg, #FAF7EE 0%, #EFE9D9 100%); border: 3px double ${pubColor};">
      <div class="text-[9px] font-bold tracking-wider uppercase border-b pb-1" style="color: ${pubColor}; border-color: ${pubColor}33;">
        ${book.series}
      </div>
      <div class="my-auto py-2">
        <h4 class="font-serif font-black text-sm tracking-tight text-neutral-800 leading-snug">
          ${book.title}
        </h4>
        <p class="text-[10px] text-neutral-500 font-serif mt-1">
          ${book.author}
        </p>
      </div>
      <div class="text-[9px] font-serif font-semibold" style="color: ${pubColor};">
        ${book.publisher}
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------------------
// [6] 이전 / 다음 / 랜덤 도서 이동
// ----------------------------------------------------------------------------

function prevBook() {
  playPaperTurnSound();
  renderBook(state.currentIndex - 1, 'left');
}

function nextBook() {
  playPaperTurnSound();
  renderBook(state.currentIndex + 1, 'right');
}

function randomBook() {
  if (state.filteredBooks.length <= 1) return;
  playPaperTurnSound();
  let r;
  do {
    r = Math.floor(Math.random() * state.filteredBooks.length);
  } while (r === state.currentIndex);
  renderBook(r, 'fade');
  showToast('🎲 랜덤 책을 펼쳤습니다!');
}

function updateProgressBar() {
  const bar = document.getElementById('readingProgressBar');
  if (!bar) return;
  const total = state.filteredBooks.length;
  const pct = total > 0 ? ((state.currentIndex + 1) / total) * 100 : 0;
  bar.style.width = `${pct}%`;
}

// ----------------------------------------------------------------------------
// [7] 북마크 (서재 보관함) 관리
// ----------------------------------------------------------------------------

function isBookmarked(bookId) {
  return state.bookmarks.includes(bookId);
}

function toggleBookmark() {
  if (state.filteredBooks.length === 0) return;
  const currentBook = state.filteredBooks[state.currentIndex];
  const idx = state.bookmarks.indexOf(currentBook.id);

  if (idx > -1) {
    state.bookmarks.splice(idx, 1);
    showToast(`'${currentBook.title}' 보관함에서 해제되었습니다.`);
  } else {
    state.bookmarks.push(currentBook.id);
    showToast(`⭐ '${currentBook.title}' 내 서재에 보관되었습니다.`);
  }

  localStorage.setItem('worldbooks_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkIcon();
  updateBookmarkBadgeCount();
}

function updateBookmarkIcon() {
  const icon = document.getElementById('bookmarkIcon');
  if (!icon || state.filteredBooks.length === 0) return;
  const currentBook = state.filteredBooks[state.currentIndex];

  if (isBookmarked(currentBook.id)) {
    icon.classList.add('text-amber-500', 'fill-amber-500');
    icon.classList.remove('text-neutral-400');
  } else {
    icon.classList.remove('text-amber-500', 'fill-amber-500');
    icon.classList.add('text-neutral-400');
  }
}

function updateBookmarkBadgeCount() {
  const badge = document.getElementById('bookmarkCountBadge');
  if (!badge) return;
  const count = state.bookmarks.length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function openBookmarksModal() {
  const modal = document.getElementById('bookmarksModal');
  const listContainer = document.getElementById('bookmarksListContainer');
  const emptyState = document.getElementById('bookmarksEmptyState');
  if (!modal || !listContainer) return;

  listContainer.innerHTML = '';
  const bookmarkedBooks = WORLD_BOOKS.filter(b => state.bookmarks.includes(b.id));

  if (bookmarkedBooks.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    bookmarkedBooks.forEach(b => {
      const item = document.createElement('div');
      item.className = 'flex items-center gap-3 p-2.5 rounded-xl border transition hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer bookmark-item-card';
      item.innerHTML = `
        <img src="${b.coverUrl}" alt="${b.title}" class="w-12 h-16 object-cover rounded shadow flex-shrink-0" onerror="this.src='./icon-192.png'">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded" style="background-color: var(--accent-bg); color: var(--accent-color)">${b.publisher}</span>
            <span class="text-[10px] text-neutral-400">★ ${b.rating}</span>
          </div>
          <h4 class="font-serif font-bold text-sm truncate mt-0.5" style="color: var(--text-primary)">${b.title}</h4>
          <p class="text-[11px] truncate text-neutral-500">${b.author} 지음</p>
        </div>
        <button onclick="event.stopPropagation(); removeBookmarkFromList(${b.id})" class="p-1.5 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-500 text-xs flex-shrink-0" title="보관함에서 삭제">
          ✕
        </button>
      `;
      item.onclick = () => {
        closeBookmarksModal();
        jumpToBookById(b.id);
      };
      listContainer.appendChild(item);
    });
  }

  modal.classList.remove('hidden');
}

function closeBookmarksModal() {
  const modal = document.getElementById('bookmarksModal');
  if (modal) modal.classList.add('hidden');
}

function removeBookmarkFromList(id) {
  state.bookmarks = state.bookmarks.filter(bId => bId !== id);
  localStorage.setItem('worldbooks_bookmarks', JSON.stringify(state.bookmarks));
  updateBookmarkIcon();
  updateBookmarkBadgeCount();
  openBookmarksModal(); // 리스트 새로고침
}

// ----------------------------------------------------------------------------
// [8] 검색 기능 (실시간 모달 검색)
// ----------------------------------------------------------------------------

function openSearchModal() {
  const modal = document.getElementById('searchModal');
  const input = document.getElementById('searchInput');
  if (!modal || !input) return;
  modal.classList.remove('hidden');
  input.value = '';
  input.focus();
  renderSearchResults('');
}

function closeSearchModal() {
  const modal = document.getElementById('searchModal');
  if (modal) modal.classList.add('hidden');
}

function handleSearchInput(e) {
  const q = e.target.value.trim().toLowerCase();
  renderSearchResults(q);
}

function renderSearchResults(query) {
  const container = document.getElementById('searchResultsContainer');
  const empty = document.getElementById('searchEmptyState');
  if (!container) return;

  container.innerHTML = '';
  let matches = WORLD_BOOKS;

  if (query) {
    matches = WORLD_BOOKS.filter(b => 
      b.title.toLowerCase().includes(query) ||
      b.titleEn.toLowerCase().includes(query) ||
      b.author.toLowerCase().includes(query) ||
      b.publisher.toLowerCase().includes(query) ||
      b.tags.some(t => t.toLowerCase().includes(query)) ||
      b.plot.toLowerCase().includes(query) ||
      b.quote.toLowerCase().includes(query)
    );
  }

  if (matches.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    matches.forEach(b => {
      const card = document.createElement('div');
      card.className = 'flex items-center gap-3 p-2.5 rounded-xl border transition hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer search-result-item';
      card.innerHTML = `
        <img src="${b.coverUrl}" alt="${b.title}" class="w-11 h-15 object-cover rounded shadow flex-shrink-0" onerror="this.src='./icon-192.png'">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded" style="background-color: var(--accent-bg); color: var(--accent-color)">${b.publisher}</span>
            <span class="text-[10px] text-amber-500 font-bold">★ ${b.rating}</span>
            <span class="text-[10px] text-neutral-400">· ${b.category}</span>
          </div>
          <h4 class="font-serif font-bold text-sm truncate mt-0.5" style="color: var(--text-primary)">${b.title}</h4>
          <p class="text-[11px] text-neutral-500 truncate">${b.author} · ${b.era}</p>
        </div>
      `;
      card.onclick = () => {
        closeSearchModal();
        jumpToBookById(b.id);
      };
      container.appendChild(card);
    });
  }
}

function jumpToBookById(bookId) {
  // 현재 필터에서 찾아보고, 없으면 전체 필터로 전환
  let targetIdx = state.filteredBooks.findIndex(b => b.id === bookId);
  if (targetIdx === -1) {
    setFilter('all');
    targetIdx = state.filteredBooks.findIndex(b => b.id === bookId);
  }
  if (targetIdx !== -1) {
    renderBook(targetIdx, 'fade');
  }
}

// ----------------------------------------------------------------------------
// [9] 표지 확대 모달 & 클립보드 공유
// ----------------------------------------------------------------------------

function openCoverZoomModal() {
  if (state.filteredBooks.length === 0) return;
  const book = state.filteredBooks[state.currentIndex];
  const modal = document.getElementById('coverZoomModal');
  const modalImg = document.getElementById('coverZoomImage');
  const modalTitle = document.getElementById('coverZoomTitle');
  const modalPub = document.getElementById('coverZoomPublisher');

  if (!modal || !modalImg) return;
  modalImg.src = book.coverUrl;
  if (modalTitle) modalTitle.textContent = book.title;
  if (modalPub) modalPub.textContent = `${book.series || book.publisher} · ${book.author} 지음`;

  modal.classList.remove('hidden');
}

function closeCoverZoomModal() {
  const modal = document.getElementById('coverZoomModal');
  if (modal) modal.classList.add('hidden');
}

function copyCurrentBookInfo() {
  if (state.filteredBooks.length === 0) return;
  const b = state.filteredBooks[state.currentIndex];
  const shareText = `📚 [세계문학전집] 《${b.title}》 (${b.author} 지음 · ${b.publisher})\n\n` +
    `⭐ 독자 평점: ★ ${b.rating} / 5.0 (${b.reviewsCount})\n` +
    `🏷️ 주제: ${b.theme}\n\n` +
    `💬 대표 명문장:\n"${b.quote}"\n\n` +
    `📖 핵심 줄거리:\n${b.plot}\n\n` +
    `💡 오늘의 독서 화두:\n${b.readingPoint}\n\n` +
    `🔗 교보문고 바로가기: ${b.kyoboUrl || 'https://kig0402.github.io/worldbooks'}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('📋 도서 소개와 명문장이 클립보드에 복사되었습니다.');
    }).catch(() => fallbackCopy(shareText));
  } else {
    fallbackCopy(shareText);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('📋 도서 소개가 복사되었습니다.');
}

// 네이티브 공유 API 지원
function shareCurrentBook() {
  if (state.filteredBooks.length === 0) return;
  const b = state.filteredBooks[state.currentIndex];

  if (navigator.share) {
    navigator.share({
      title: `《${b.title}》 - ${b.publisher}`,
      text: `"${b.quote}"\n\n세계문학전집 큐레이션에서 만난 《${b.title}》 (${b.author} 지음)`,
      url: window.location.href
    }).catch(err => {
      if (err.name !== 'AbortError') copyCurrentBookInfo();
    });
  } else {
    copyCurrentBookInfo();
  }
}

// ----------------------------------------------------------------------------
// [10] 토스트 메시지 & 날짜 표시
// ----------------------------------------------------------------------------

function showToast(message) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('opacity-0', 'pointer-events-none');
  toast.classList.add('opacity-100');

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.classList.remove('opacity-100');
    toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2300);
}

function updateDateDisplay() {
  const el = document.getElementById('currentDateDisplay');
  if (!el) return;
  const now = new Date();
  const options = { month: 'long', day: 'numeric', weekday: 'short' };
  el.textContent = `${now.toLocaleDateString('ko-KR', options)} · 오늘의 세계문학`;
}

// ----------------------------------------------------------------------------
// [11] 터치 스와이프 & 키보드 내비게이션
// ----------------------------------------------------------------------------

function initGesturesAndShortcuts() {
  const swipeArea = document.getElementById('swipeArea');
  if (swipeArea) {
    swipeArea.addEventListener('touchstart', e => {
      state.touchStartX = e.changedTouches[0].screenX;
      state.touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    swipeArea.addEventListener('touchend', e => {
      state.touchEndX = e.changedTouches[0].screenX;
      state.touchEndY = e.changedTouches[0].screenY;
      handleSwipe();
    }, { passive: true });
  }

  // 키보드 방향키 탐색
  window.addEventListener('keydown', e => {
    // 모달이 열려있거나 인풋 입력 중일 때는 무시
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    if (['searchModal', 'bookmarksModal', 'coverZoomModal'].some(id => !document.getElementById(id).classList.contains('hidden'))) return;

    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'j') {
      e.preventDefault();
      nextBook();
    } else if (e.key === 'ArrowLeft' || e.key === 'k') {
      e.preventDefault();
      prevBook();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      randomBook();
    } else if (e.key === 'b' || e.key === 'B') {
      e.preventDefault();
      toggleBookmark();
    }
  });
}

function handleSwipe() {
  const deltaX = state.touchEndX - state.touchStartX;
  const deltaY = state.touchEndY - state.touchStartY;

  // 좌우 스와이프만 인식 (수직 스크롤과 간섭 방지: 수평 이동이 수직 이동보다 1.4배 이상 클 때)
  if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
    if (deltaX < 0) {
      nextBook(); // 왼쪽으로 밀면 다음 책
    } else {
      prevBook(); // 오른쪽으로 밀면 이전 책
    }
  }
}

// ----------------------------------------------------------------------------
// [12] 초기화 (Init)
// ----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // 1. 테마 및 글자 크기 복원
  applyTheme(state.currentTheme);
  applyFontSize(state.fontSizeLevel);
  updateSoundButtonUI();

  // 2. 날짜 표시 및 오늘의 7선 생성
  updateDateDisplay();
  state.dailyBooks = generateDailyBooks();
  state.filteredBooks = [...state.dailyBooks];

  // 3. UI 배지, 필터 칩 카운트 및 북마크 초기화
  updateBookmarkBadgeCount();
  updateModeIndicator();
  updateFilterChipCounts();

  // 4. 첫 번째 책 렌더링
  renderBook(0, 'fade');

  // 5. 제스처 및 단축키 등록
  initGesturesAndShortcuts();
});
