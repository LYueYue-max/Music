/* ============================================================
 * player.js —— 圆润方形播放器弹窗（睡眠定时 / 倍速 / 收藏 / 歌单 / 播放统计）
 * ============================================================ */
(function (window) {
  'use strict';
  var RM = window.RM;

  var LS_VOL = 'RM_VOLUME';
  var LS_MODE = 'RM_MODE';
  var LS_SHUFFLE = 'RM_SHUFFLE';
  var LS_SPEED = 'RM_SPEED';

  var SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  var Player = RM.Player = {

    audio: null,
    root: null,
    uiReady: false,

    state: {
      list: [],
      index: 0,
      mode: 'list',
      shuffle: false,
      volume: 0.8,
      speed: 1,
      isOpen: false,
      minimized: false,
      triedPlay: false,
      playedThisLoad: false,
      sleepEnd: 0,
      sleepTimer: null,
      sleepWhenEnded: false
    },

    init: function () {
      var self = this;

      var savedVol = parseFloat(localStorage.getItem(LS_VOL));
      this.state.volume = (!isNaN(savedVol) && savedVol >= 0 && savedVol <= 1) ? savedVol : 0.8;

      var savedMode = localStorage.getItem(LS_MODE);
      this.state.mode = savedMode === 'single' ? 'single' : 'list';

      this.state.shuffle = localStorage.getItem(LS_SHUFFLE) === '1';

      var savedSpeed = parseFloat(localStorage.getItem(LS_SPEED));
      this.state.speed = SPEEDS.indexOf(savedSpeed) !== -1 ? savedSpeed : 1;

      var audio = new Audio();
      audio.preload = 'none';
      audio.volume = this.state.volume;
      audio.muted = false;
      audio.playbackRate = this.state.speed;
      this.audio = audio;

      audio.addEventListener('timeupdate', function () { self.onTimeUpdate(); });
      audio.addEventListener('loadedmetadata', function () { self.onTimeUpdate(); });
      audio.addEventListener('play', function () { self.updatePlayBtn(); });
      audio.addEventListener('pause', function () { self.updatePlayBtn(); });
      audio.addEventListener('ended', function () { self.onEnded(); });
      audio.addEventListener('error', function () {
        if (!self.state.triedPlay) return;
        self.showError('播放失败：链接可能失效、跨域受限或音频格式不受支持');
        self.updatePlayBtn();
      });

      document.addEventListener('keydown', function (e) { self.onKeyDown(e); });

      setInterval(function () {
        if (self.state.isOpen && !self.state.minimized) self.updateSleepUI();
      }, 1000);
    },

    open: function (list, index) {
      if (!Array.isArray(list) || !list.length) {
        RM.toast('当前没有可播放的音乐', 'warn');
        return;
      }
      this.state.list = list.slice();
      this.state.index = Math.max(0, Math.min(index || 0, list.length - 1));
      this.state.isOpen = true;
      this.state.minimized = false;

      this.ensureUI();
      this.root.querySelector('#player-window').hidden = false;
      this.root.querySelector('#player-mini').hidden = true;

      var win = this.root.querySelector('#player-window');
      win.style.left = '50%';
      win.style.top = '50%';
      win.style.transform = 'translate(-50%, -50%)';

      this.loadSong(this.state.index, false);
    },

    close: function () {
      if (!this.state.isOpen) return;
      this.state.isOpen = false;
      this.state.minimized = false;
      try { this.audio.pause(); } catch (e) {}
      if (this.root) {
        var win = this.root.querySelector('#player-window');
        var mini = this.root.querySelector('#player-mini');
        if (win) win.hidden = true;
        if (mini) mini.hidden = true;
      }
    },

    minimize: function () {
      if (!this.state.isOpen) return;
      this.state.minimized = true;
      this.root.querySelector('#player-window').hidden = true;
      this.root.querySelector('#player-mini').hidden = false;
      this.updateMini();
    },

    restore: function () {
      if (!this.state.isOpen) return;
      this.state.minimized = false;
      this.root.querySelector('#player-mini').hidden = true;
      this.root.querySelector('#player-window').hidden = false;
      this.updateAll();
    },

    loadSong: function (index, autoPlay) {
      var song = this.state.list[index];
      if (!song) return;

      this.state.index = index;
      this.state.triedPlay = false;
      this.state.playedThisLoad = false;
      this.hideError();

      try { this.audio.pause(); } catch (e) {}

      this.audio.src = song.url;
      this.audio.volume = this.state.volume;
      this.audio.muted = false;
      this.audio.playbackRate = this.state.speed;

      var user = RM.Store.currentUser();
      if (user && song.id) RM.Store.pushHistory(user, song.id);

      this.updateAll();
      this.updatePlayBtn();

      if (autoPlay) this.play();
    },

    play: async function () {
      this.state.triedPlay = true;
      this.hideError();
      try {
        await this.audio.play();
      } catch (err) {
        if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
          if (err.name === 'NotAllowedError') {
            this.showError('浏览器阻止了自动播放，请再次点击播放按钮');
          }
          return;
        }
        this.showError('无法播放：链接可能失效、跨域受限或音频格式不受支持');
        this.updatePlayBtn();
        return;
      }

      if (!this.state.playedThisLoad) {
        this.state.playedThisLoad = true;
        var song = this.state.list[this.state.index];
        if (song && song.id) {
          RM.Store.incPlay(song.id);
          this.renderList();
        }
      }
      this.updatePlayBtn();
    },

    togglePlay: function () {
      if (!this.state.list.length) return;
      if (this.audio.paused) this.play();
      else this.audio.pause();
    },

    prev: function () {
      var list = this.state.list;
      if (!list.length) return;
      var idx = this.state.index - 1;
      if (idx < 0) idx = list.length - 1;
      if (this.state.shuffle && list.length > 1) {
        do { idx = Math.floor(Math.random() * list.length); } while (idx === this.state.index);
      }
      this.loadSong(idx, true);
    },

    next: function (auto) {
      var list = this.state.list;
      if (!list.length) return;
      if (auto && this.state.mode === 'single') {
        try { this.audio.currentTime = 0; } catch (e) {}
        this.play();
        return;
      }
      var idx = this.state.index + 1;
      if (idx >= list.length) idx = 0;
      if (this.state.shuffle && list.length > 1) {
        do { idx = Math.floor(Math.random() * list.length); } while (idx === this.state.index);
      }
      this.loadSong(idx, true);
    },

    onEnded: function () {
      if (this.state.sleepWhenEnded) {
        this.state.sleepWhenEnded = false;
        try { this.audio.pause(); } catch (e) {}
        RM.toast('睡眠定时已到，播放暂停', 'warn');
        this.updateSleepUI();
        return;
      }
      if (this.state.mode === 'single') {
        try { this.audio.currentTime = 0; } catch (e) {}
        this.play();
        return;
      }
      this.next(true);
    },

    /* ---------------- 睡眠定时 ---------------- */
    setSleep: function (minutes) {
      var self = this;
      clearTimeout(this.state.sleepTimer);
      this.state.sleepTimer = null;
      this.state.sleepEnd = 0;
      this.state.sleepWhenEnded = false;

      if (!minutes) {
        RM.toast('已取消睡眠定时');
        this.updateSleepUI();
        return;
      }
      var ms = minutes * 60 * 1000;
      this.state.sleepEnd = Date.now() + ms;
      this.state.sleepTimer = setTimeout(function () {
        try { self.audio.pause(); } catch (e) {}
        self.state.sleepEnd = 0;
        self.state.sleepTimer = null;
        RM.toast('睡眠定时已到，播放暂停', 'warn');
        self.updateSleepUI();
      }, ms);
      RM.toast('将在 ' + minutes + ' 分钟后暂停播放', 'ok');
      this.updateSleepUI();
    },

    setSleepSong: function () {
      clearTimeout(this.state.sleepTimer);
      this.state.sleepTimer = null;
      this.state.sleepEnd = 0;
      this.state.sleepWhenEnded = true;
      RM.toast('本曲结束后将自动暂停');
      this.updateSleepUI();
    },

    openSleepDialog: function () {
      var self = this;
      var active = this.state.sleepEnd > Date.now() || this.state.sleepWhenEnded;
      var content =
        '<p>选择自动暂停的时间：</p>' +
        '<div class="sleep-options">' +
          [15, 30, 60, 90].map(function (m) {
            return '<button type="button" class="btn btn-ghost" data-sleep="' + m + '">' + m + ' 分钟</button>';
          }).join('') +
          '<button type="button" class="btn btn-ghost" data-sleep="song">本曲结束后</button>' +
          (active ? '<button type="button" class="btn btn-danger" data-sleep="0">取消定时</button>' : '') +
        '</div>';

      RM.dialog({
        title: '睡眠定时',
        content: content,
        actions: [{ text: '关闭', kind: 'ghost' }],
        onMount: function (card, close) {
          card.querySelector('.sleep-options').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-sleep]');
            if (!btn) return;
            var v = btn.getAttribute('data-sleep');
            if (v === 'song') self.setSleepSong();
            else self.setSleep(Number(v));
            close();
          });
        }
      });
    },

    /* ---------------- 模式 / 音量 / 倍速 ---------------- */
    toggleMode: function () {
      this.state.mode = this.state.mode === 'list' ? 'single' : 'list';
      localStorage.setItem(LS_MODE, this.state.mode);
      this.updateModeUI();
      RM.toast(this.state.mode === 'single' ? '已切换到单曲循环' : '已切换到列表循环');
    },

    toggleShuffle: function () {
      this.state.shuffle = !this.state.shuffle;
      localStorage.setItem(LS_SHUFFLE, this.state.shuffle ? '1' : '0');
      this.updateModeUI();
      RM.toast(this.state.shuffle ? '已开启随机播放' : '已关闭随机播放');
    },

    setVolume: function (v) {
      v = Math.max(0, Math.min(1, v));
      this.state.volume = v;
      this.audio.volume = v;
      this.audio.muted = false;
      localStorage.setItem(LS_VOL, String(v));
      this.updateVolumeUI();
    },

    toggleMute: function () {
      this.audio.muted = !this.audio.muted;
      this.updateVolumeUI();
    },

    cycleSpeed: function () {
      var i = SPEEDS.indexOf(this.state.speed);
      i = (i + 1) % SPEEDS.length;
      this.setSpeed(SPEEDS[i]);
      RM.toast('播放速度 ' + SPEEDS[i] + 'x');
    },

    setSpeed: function (s) {
      this.state.speed = s;
      this.audio.playbackRate = s;
      localStorage.setItem(LS_SPEED, String(s));
      this.updateSpeedUI();
    },

    /* ---------------- 收藏 / 歌单 ---------------- */
    toggleFav: function () {
      var user = RM.Store.currentUser();
      var song = this.state.list[this.state.index];
      if (!user || !song) return;
      var on = RM.Store.toggleFavorite(user, song.id);
      RM.toast(on ? '已收藏' : '已取消收藏');
      this.updateFavUI();
      if (RM.rerender) RM.rerender();
    },

    addToPlaylistDialog: function () {
      var user = RM.Store.currentUser();
      var song = this.state.list[this.state.index];
      if (!user || !song) return;
      var lists = user.playlists || [];
      if (!lists.length) {
        RM.toast('还没有歌单，先去「我的歌单」创建一个', 'warn');
        return;
      }
      var opts = lists.map(function (p) {
        return '<option value="' + RM.escapeHtml(p.id) + '">' +
          RM.escapeHtml(p.name) + '（' + p.songIds.length + ' 首）</option>';
      }).join('');

      RM.dialog({
        title: '加入歌单',
        content:
          '<p>将《' + RM.escapeHtml(song.title) + '》加入：</p>' +
          '<label class="field"><span>选择歌单</span>' +
            '<select id="pl-select">' + opts + '</select></label>',
        actions: [
          { text: '取消', kind: 'ghost' },
          {
            text: '加入', kind: 'primary',
            onClick: function (close, card) {
              var id = card.querySelector('#pl-select').value;
              var res = RM.Store.addToPlaylist(user, id, song.id);
              if (!res.ok) { RM.toast(res.msg, 'error'); return; }
              RM.toast('已加入歌单', 'ok');
              close();
            }
          }
        ]
      });
    },

    deleteSong: async function (song, liIndex) {
      var user = RM.Store.currentUser();
      if (!user || user.role !== 'admin') {
        RM.toast('无权限删除音乐', 'error');
        return;
      }
      var ok = await RM.confirm({
        title: '删除音乐',
        message: '确定要删除《' + song.title + '》吗？\n此操作只删除当前浏览器中的音乐记录，不会删除源文件。',
        confirmText: '删除', danger: true
      });
      if (!ok) return;

      RM.Store.db.songs = RM.Store.db.songs.filter(function (s) { return s.id !== song.id; });
      RM.Store.addLog('删除音乐', song.title, '播放器内删除');

      var wasCurrent = this.state.list[this.state.index] &&
                       this.state.list[this.state.index].id === song.id;

      this.state.list = this.state.list.filter(function (s) { return s.id !== song.id; });

      if (!this.state.list.length) {
        this.close();
        RM.toast('播放列表已清空');
      } else {
        if (wasCurrent) {
          var newIdx = Math.min(liIndex, this.state.list.length - 1);
          this.loadSong(newIdx, false);
        } else {
          this.state.index = Math.min(this.state.index, this.state.list.length - 1);
          this.updateAll();
        }
      }
      if (RM.rerender) RM.rerender();
    },

    /* ---------------- UI ---------------- */
    ensureUI: function () {
      if (this.uiReady && this.root && this.root.querySelector('#player-window')) return;

      var host = document.getElementById('player-host');
      var isAdmin = (RM.Store.currentUser() || {}).role === 'admin';

      host.innerHTML =
        '<div class="player-window" id="player-window" hidden>' +
          '<div class="player-drag" id="player-drag"><div class="player-drag-bar"></div></div>' +
          '<div class="player-head">' +
            '<div class="player-cover"><img id="pv-cover" src="' + RM.DEFAULT_COVER + '" alt="封面"></div>' +
            '<div class="player-meta">' +
              '<div class="player-title" id="pv-title">未选择歌曲</div>' +
              '<a class="player-source" id="pv-source" href="#" target="_blank" rel="noopener noreferrer">来源链接</a>' +
            '</div>' +
            '<div class="player-head-actions">' +
              '<button type="button" class="icon-btn" id="pv-min" title="最小化">—</button>' +
              '<button type="button" class="icon-btn" id="pv-close" title="关闭">✕</button>' +
            '</div>' +
          '</div>' +
          '<div class="player-error" id="pv-error" hidden></div>' +
          '<div class="player-progress">' +
            '<input type="range" id="pv-seek" min="0" max="1000" value="0" step="1">' +
            '<div class="player-times"><span id="pv-cur">0:00</span><span id="pv-dur">0:00</span></div>' +
          '</div>' +
          '<div class="player-extra">' +
            '<button type="button" class="ctrl-btn small speed-btn" id="pv-speed" title="播放速度">1x</button>' +
            '<button type="button" class="ctrl-btn small" id="pv-sleep" title="睡眠定时">⏱</button>' +
            '<button type="button" class="ctrl-btn small" id="pv-fav" title="收藏">♡</button>' +
            '<button type="button" class="ctrl-btn small" id="pv-addpl" title="加入歌单">＋</button>' +
          '</div>' +
          '<div class="player-controls">' +
            '<button type="button" class="ctrl-btn" id="pv-shuffle" title="随机播放">🔀</button>' +
            '<button type="button" class="ctrl-btn" id="pv-prev" title="上一首">⏮</button>' +
            '<button type="button" class="ctrl-btn ctrl-main" id="pv-play" title="播放/暂停">▶</button>' +
            '<button type="button" class="ctrl-btn" id="pv-next" title="下一首">⏭</button>' +
            '<button type="button" class="ctrl-btn" id="pv-mode" title="循环模式">🔁</button>' +
          '</div>' +
          '<div class="player-volume">' +
            '<button type="button" class="ctrl-btn small" id="pv-mute" title="静音">🔊</button>' +
            '<input type="range" id="pv-vol" min="0" max="100" value="' +
              Math.round(this.state.volume * 100) + '">' +
          '</div>' +
          '<div class="player-list-wrap">' +
            '<div class="player-list-head"><span>播放列表</span><span id="pv-count"></span></div>' +
            '<ul class="player-list" id="pv-list"></ul>' +
          '</div>' +
        '</div>' +
        '<div class="player-mini" id="player-mini" hidden>' +
          '<span class="mini-title" id="pv-mini-title">未播放</span>' +
          '<button type="button" class="ctrl-btn small" id="pv-mini-play" title="播放/暂停">▶</button>' +
          '<button type="button" class="ctrl-btn small" id="pv-mini-open" title="展开">⤢</button>' +
          '<button type="button" class="ctrl-btn small" id="pv-mini-close" title="关闭">✕</button>' +
        '</div>';

      this.root = host;
      this.uiReady = true;
      this.isAdminView = isAdmin;
      this.bindUI();
      this.updateModeUI();
      this.updateVolumeUI();
      this.updateSpeedUI();
      this.updateSleepUI();
    },

    bindUI: function () {
      var self = this;
      var $ = function (id) { return self.root.querySelector('#' + id); };

      $('pv-close').addEventListener('click', function () { self.close(); });
      $('pv-min').addEventListener('click', function () { self.minimize(); });
      $('pv-play').addEventListener('click', function () { self.togglePlay(); });
      $('pv-prev').addEventListener('click', function () { self.prev(); });
      $('pv-next').addEventListener('click', function () { self.next(false); });
      $('pv-mode').addEventListener('click', function () { self.toggleMode(); });
      $('pv-shuffle').addEventListener('click', function () { self.toggleShuffle(); });
      $('pv-mute').addEventListener('click', function () { self.toggleMute(); });
      $('pv-speed').addEventListener('click', function () { self.cycleSpeed(); });
      $('pv-sleep').addEventListener('click', function () { self.openSleepDialog(); });
      $('pv-fav').addEventListener('click', function () { self.toggleFav(); });
      $('pv-addpl').addEventListener('click', function () { self.addToPlaylistDialog(); });

      $('pv-vol').addEventListener('input', function () {
        self.setVolume(Number(this.value) / 100);
      });
      $('pv-seek').addEventListener('input', function () {
        var dur = self.audio.duration;
        if (!dur || !isFinite(dur)) return;
        try { self.audio.currentTime = (Number(this.value) / 1000) * dur; } catch (e) {}
      });

      $('pv-list').addEventListener('click', function (e) {
        var delBtn = e.target.closest('.pl-del');
        if (delBtn) {
          e.stopPropagation();
          var di = Number(delBtn.getAttribute('data-del'));
          var song = self.state.list[di];
          if (song) self.deleteSong(song, di);
          return;
        }
        var item = e.target.closest('.pl-item');
        if (item) {
          var idx = Number(item.getAttribute('data-idx'));
          if (!isNaN(idx)) self.loadSong(idx, true);
        }
      });

      $('pv-mini-play').addEventListener('click', function () { self.togglePlay(); });
      $('pv-mini-open').addEventListener('click', function () { self.restore(); });
      $('pv-mini-close').addEventListener('click', function () { self.close(); });

      var dragHandle = $('player-drag');
      dragHandle.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        self.startDrag(e);
      });
      dragHandle.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        self.startDrag(e.touches[0]);
      }, { passive: true });
    },

    startDrag: function (startEvent) {
      var win = this.root.querySelector('#player-window');
      var rect = win.getBoundingClientRect();
      win.style.transform = 'none';
      win.style.left = rect.left + 'px';
      win.style.top = rect.top + 'px';

      var offX = startEvent.clientX - rect.left;
      var offY = startEvent.clientY - rect.top;
      var w = rect.width;
      var h = rect.height;

      function move(clientX, clientY) {
        var x = clientX - offX;
        var y = clientY - offY;
        x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
        y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
        win.style.left = x + 'px';
        win.style.top = y + 'px';
      }
      var onMouseMove = function (e) { move(e.clientX, e.clientY); };
      var onTouchMove = function (e) {
        if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
      };
      var stop = function () {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', stop);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', stop);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', stop);
      document.addEventListener('touchmove', onTouchMove, { passive: true });
      document.addEventListener('touchend', stop);
    },

    onKeyDown: function (e) {
      if (!this.state.isOpen || this.state.minimized) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); this.togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); this.next(false); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    },

    updateAll: function () {
      if (!this.uiReady) return;
      var self = this;
      var $ = function (id) { return self.root.querySelector('#' + id); };
      var song = this.state.list[this.state.index];
      if (!song) return;

      var cover = $('pv-cover');
      cover.onerror = function () { this.onerror = null; this.src = RM.DEFAULT_COVER; };
      cover.src = song.cover || RM.DEFAULT_COVER;

      $('pv-title').textContent = song.title;
      $('pv-title').title = song.title;

      var src = $('pv-source');
      src.href = song.url;
      src.textContent = '来源链接 ↗';
      src.title = song.url;

      this.renderList();
      this.updatePlayBtn();
      this.updateModeUI();
      this.updateVolumeUI();
      this.updateSpeedUI();
      this.updateFavUI();
      this.updateSleepUI();
      this.updateMini();
      this.onTimeUpdate();
    },

    renderList: function () {
      var self = this;
      var ul = self.root.querySelector('#pv-list');
      var isAdmin = (RM.Store.currentUser() || {}).role === 'admin';

      ul.innerHTML = this.state.list.map(function (s, i) {
        return '<li class="pl-item' + (i === self.state.index ? ' active' : '') +
          '" data-idx="' + i + '">' +
          '<span class="pl-index">' + (i + 1) + '</span>' +
          '<span class="pl-title">' + RM.escapeHtml(s.title) + '</span>' +
          (isAdmin ? '<button type="button" class="pl-del" data-del="' + i + '" title="删除">✕</button>' : '') +
          '</li>';
      }).join('');
      self.root.querySelector('#pv-count').textContent = this.state.list.length + ' 首';
    },

    updatePlayBtn: function () {
      if (!this.uiReady) return;
      var btn = this.root.querySelector('#pv-play');
      var mini = this.root.querySelector('#pv-mini-play');
      var paused = this.audio.paused;
      if (btn) btn.textContent = paused ? '▶' : '⏸';
      if (mini) mini.textContent = paused ? '▶' : '⏸';
    },

    updateModeUI: function () {
      if (!this.uiReady) return;
      var modeBtn = this.root.querySelector('#pv-mode');
      var shuffleBtn = this.root.querySelector('#pv-shuffle');
      if (modeBtn) {
        modeBtn.textContent = this.state.mode === 'single' ? '🔂' : '🔁';
        modeBtn.classList.toggle('on', this.state.mode === 'single');
        modeBtn.title = this.state.mode === 'single' ? '单曲循环' : '列表循环';
      }
      if (shuffleBtn) {
        shuffleBtn.classList.toggle('on', this.state.shuffle);
        shuffleBtn.title = this.state.shuffle ? '随机播放：开' : '随机播放：关';
      }
    },

    updateVolumeUI: function () {
      if (!this.uiReady) return;
      var muteBtn = this.root.querySelector('#pv-mute');
      var volSlider = this.root.querySelector('#pv-vol');
      var muted = this.audio.muted || this.state.volume === 0;
      if (muteBtn) muteBtn.textContent = muted ? '🔇' : (this.state.volume < 0.5 ? '🔉' : '🔊');
      if (volSlider && document.activeElement !== volSlider) {
        volSlider.value = String(Math.round((muted ? 0 : this.state.volume) * 100));
      }
    },

    updateSpeedUI: function () {
      if (!this.uiReady) return;
      var btn = this.root.querySelector('#pv-speed');
      if (btn) {
        btn.textContent = this.state.speed + 'x';
        btn.classList.toggle('on', this.state.speed !== 1);
      }
    },

    updateSleepUI: function () {
      if (!this.uiReady) return;
      var btn = this.root.querySelector('#pv-sleep');
      if (!btn) return;
      if (this.state.sleepWhenEnded) {
        btn.classList.add('on');
        btn.title = '本曲结束后暂停';
      } else if (this.state.sleepEnd > Date.now()) {
        btn.classList.add('on');
        btn.title = '睡眠定时：' + RM.formatRemaining(this.state.sleepEnd - Date.now());
      } else {
        btn.classList.remove('on');
        btn.title = '睡眠定时';
      }
    },

    updateFavUI: function () {
      if (!this.uiReady) return;
      var btn = this.root.querySelector('#pv-fav');
      if (!btn) return;
      var user = RM.Store.currentUser();
      var song = this.state.list[this.state.index];
      var on = !!(user && song && RM.Store.isFavorite(user, song.id));
      btn.textContent = on ? '♥' : '♡';
      btn.classList.toggle('on', on);
      btn.title = on ? '取消收藏' : '收藏';
    },

    updateMini: function () {
      if (!this.uiReady) return;
      var el = this.root.querySelector('#pv-mini-title');
      var song = this.state.list[this.state.index];
      if (el) el.textContent = song ? song.title : '未播放';
    },

    onTimeUpdate: function () {
      if (!this.uiReady || !this.audio) return;
      var curEl = this.root.querySelector('#pv-cur');
      var durEl = this.root.querySelector('#pv-dur');
      var seek = this.root.querySelector('#pv-seek');
      if (!curEl || !durEl || !seek) return;

      var cur = this.audio.currentTime || 0;
      var dur = this.audio.duration;

      curEl.textContent = RM.fmtTime(cur);
      if (dur && isFinite(dur)) {
        durEl.textContent = RM.fmtTime(dur);
        if (document.activeElement !== seek) {
          seek.value = String(Math.round((cur / dur) * 1000));
        }
      } else {
        durEl.textContent = '--:--';
      }
    },

    showError: function (msg) {
      if (!this.uiReady) return;
      var el = this.root.querySelector('#pv-error');
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
    },

    hideError: function () {
      if (!this.uiReady) return;
      var el = this.root.querySelector('#pv-error');
      if (el) el.hidden = true;
    }
  };
})(window);