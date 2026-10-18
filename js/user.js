/* ============================================================
 * user.js —— 普通用户 / 游客界面
 * ============================================================ */
(function (window) {
  'use strict';
  var RM = window.RM;

  var User = RM.User = {

    _libPage: 1,
    _favPage: 1,
    _plView: null,

    render: function (path, user) {
      var freeze = RM.Store.freezeState(user);
      if (freeze.active) {
        this.renderFrozen(user, freeze);
        return;
      }

      var app = document.getElementById('app');

      var nav = [
        { path: '/app/library', icon: '🎵', label: '音乐库' },
        { path: '/app/favorites', icon: '♥', label: '我的收藏' },
        { path: '/app/playlists', icon: '📚', label: '我的歌单' },
        { path: '/app/profile', icon: '👤', label: '个人资料' }
      ];

      app.innerHTML =
        '<div class="user-shell">' +
          '<header class="topbar">' +
            '<div class="brand"><span class="brand-icon">🎧</span><span>圆音</span></div>' +
            '<nav class="topnav">' +
              nav.map(function (n) {
                return '<a class="nav-item' + (path === n.path ? ' active' : '') +
                  '" href="#' + n.path + '"><span class="nav-ico">' + n.icon +
                  '</span>' + n.label + '</a>';
              }).join('') +
            '</nav>' +
            '<div class="topbar-right">' +
              '<button type="button" class="btn btn-ghost btn-sm" id="theme-toggle">' +
                (RM.Theme.get() === 'dark' ? '☀️' : '🌙') + '</button>' +
              '<span class="badge badge-primary">' + RM.escapeHtml(user.username) + '</span>' +
              '<button type="button" class="btn btn-ghost btn-sm" id="user-logout">退出登录</button>' +
            '</div>' +
          '</header>' +
          '<main class="main user-main" id="main"></main>' +
        '</div>';

      document.getElementById('user-logout').addEventListener('click', function () {
        RM.Auth.logout();
      });
      document.getElementById('theme-toggle').addEventListener('click', function () {
        RM.Theme.toggle();
      });

      var main = document.getElementById('main');

      if (path === '/app/profile') this.renderProfile(main, user);
      else if (path === '/app/favorites') this.renderFavorites(main, user);
      else if (path === '/app/playlists') this.renderPlaylists(main, user);
      else this.renderLibrary(main, user);
    },

    /* ---------------- 冻结界面 ---------------- */
    renderFrozen: function (user, freeze) {
      var app = document.getElementById('app');
      var timeHtml;

      if (freeze.perm) {
        timeHtml = '账户已被永久冻结';
      } else {
        timeHtml = '账户已冻结，还剩 <b data-countdown data-end="' +
          freeze.end + '"></b> 解除';
      }

      app.innerHTML =
        '<div class="auth-wrap">' +
          '<div class="auth-card frozen-card">' +
            '<div class="frozen-icon">❄️</div>' +
            '<h2 style="font-size:22px">账户已冻结</h2>' +
            '<p class="frozen-time">' + timeHtml + '</p>' +
            '<p class="sub" style="margin-bottom:24px">' +
              '冻结期间，除查看此提示和退出登录外，无法进行任何操作。' +
            '</p>' +
            '<button type="button" class="btn btn-ghost btn-block" id="frozen-logout">退出登录</button>' +
          '</div>' +
        '</div>';

      document.getElementById('frozen-logout').addEventListener('click', function () {
        RM.Auth.logout();
      });
    },

    /* ---------------- 公告条 ---------------- */
    announcementHtml: function (user) {
      var list = (RM.Store.db.announcements || [])
        .filter(function (a) { return a.enabled; })
        .sort(function (a, b) {
          return ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || (b.createdAt - a.createdAt);
        });

      if (!list.length) return '';

      var read = user.readAnnouncements || [];
      return list.slice(0, 3).map(function (a) {
        var isRead = read.indexOf(a.id) !== -1;
        return '<div class="notice notice-info announce" data-ann="' + RM.escapeHtml(a.id) + '">' +
          '<div class="announce-head">' +
            '<b>' + (a.pinned ? '📌 ' : '') + RM.escapeHtml(a.title) + '</b>' +
            (isRead ? '' : '<span class="badge badge-warn">新</span>') +
          '</div>' +
          '<div class="announce-body">' + RM.escapeHtml(a.content) + '</div>' +
          (isRead ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-read="' +
            RM.escapeHtml(a.id) + '">知道了</button>') +
        '</div>';
      }).join('');
    },

    bindAnnouncements: function (host, user) {
      host.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-read]');
        if (!btn) return;
        var id = btn.getAttribute('data-read');
        var read = user.readAnnouncements || (user.readAnnouncements = []);
        if (read.indexOf(id) === -1) read.push(id);
        RM.Store.save();
        RM.rerender();
      });
    },

    /* ---------------- 歌曲卡片 ---------------- */
    cardHtml: function (song, idx, user) {
      var cover = song.cover || RM.DEFAULT_COVER;
      var fav = RM.Store.isFavorite(user, song.id);
      return '<div class="song-card" data-idx="' + idx + '" title="' +
        RM.escapeHtml(song.title) + '">' +
        '<button type="button" class="fav-btn' + (fav ? ' on' : '') +
          '" data-fav="' + RM.escapeHtml(song.id) + '" title="收藏">' +
          (fav ? '♥' : '♡') + '</button>' +
        '<div class="song-cover"><img src="' + RM.escapeHtml(cover) +
          '" alt="" loading="lazy" onerror="this.onerror=null;this.src=window.RM.DEFAULT_COVER"></div>' +
        '<div class="song-title">' + RM.escapeHtml(song.title) + '</div>' +
        '<div class="song-meta">' + (fav ? '已收藏' : '点击打开播放器') + '</div>' +
      '</div>';
    },

    /* ---------------- 音乐库 ---------------- */
    renderLibrary: function (main, user) {
      var self = this;
      var allSongs = RM.Store.db.songs.slice();
      self._libPage = 1;

      main.innerHTML =
        '<div id="ann-host"></div>' +
        '<div class="page-head">' +
          '<h2>音乐库</h2>' +
          '<p class="sub">共 ' + allSongs.length + ' 首音乐，点击卡片打开播放器（不会自动播放）</p>' +
        '</div>' +
        '<div id="recent-host"></div>' +
        '<div class="toolbar">' +
          '<input type="search" id="song-search" placeholder="搜索歌曲标题…" autocomplete="off">' +
          '<select id="song-sort">' +
            '<option value="new">最新添加</option>' +
            '<option value="old">最早添加</option>' +
            '<option value="title">标题 A-Z</option>' +
          '</select>' +
        '</div>' +
        '<div class="song-grid" id="song-grid"></div>' +
        '<div class="empty" id="song-empty" hidden>没有找到匹配的歌曲</div>' +
        '<div id="lib-pager"></div>';

      var annHost = main.querySelector('#ann-host');
      annHost.innerHTML = self.announcementHtml(user);
      self.bindAnnouncements(annHost, user);

      // 最近播放
      var recentHost = main.querySelector('#recent-host');
      var recentSongs = RM.Store.songsByIds(
        (user.history || []).map(function (h) { return h.songId; })
      );
      if (recentSongs.length) {
        recentHost.innerHTML =
          '<div class="page-head" style="margin-bottom:14px"><h3 style="font-size:16px">最近播放</h3></div>' +
          '<div class="rail" id="recent-rail">' +
            recentSongs.map(function (s, i) {
              return self.cardHtml(s, i, user);
            }).join('') +
          '</div>';

        recentHost.querySelector('#recent-rail').addEventListener('click', function (e) {
          var favBtn = e.target.closest('[data-fav]');
          if (favBtn) {
            e.stopPropagation();
            self.toggleFav(user, favBtn.getAttribute('data-fav'));
            return;
          }
          var card = e.target.closest('.song-card');
          if (!card) return;
          var idx = Number(card.getAttribute('data-idx'));
          if (isNaN(idx)) return;
          RM.Player.open(recentSongs, idx);
        });
      }

      var grid = main.querySelector('#song-grid');
      var emptyEl = main.querySelector('#song-empty');
      var searchEl = main.querySelector('#song-search');
      var sortEl = main.querySelector('#song-sort');
      var pagerHost = main.querySelector('#lib-pager');

      var current = [];

      function compute() {
        var kw = searchEl.value.trim().toLowerCase();
        var sort = sortEl.value;

        var list = allSongs.filter(function (s) {
          return !kw || String(s.title).toLowerCase().indexOf(kw) !== -1;
        });

        if (sort === 'new') {
          list.sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
        } else if (sort === 'old') {
          list.sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
        } else {
          list.sort(function (a, b) {
            return String(a.title).localeCompare(String(b.title), 'zh-Hans-CN');
          });
        }
        return list;
      }

      function paint() {
        current = compute();
        var paged = RM.pageSlice(current, self._libPage, 12);
        self._libPage = paged.page;
        var pageSongs = paged.items;

        if (!current.length) {
          grid.innerHTML = '';
          emptyEl.hidden = false;
          pagerHost.innerHTML = '';
          return;
        }
        emptyEl.hidden = true;

        grid.innerHTML = pageSongs.map(function (s, i) {
          return self.cardHtml(s, i, user);
        }).join('');

        pagerHost.innerHTML = RM.pagerHtml(paged.page, paged.pages);

        // 用当前页子集作为播放列表
        grid.__songs = pageSongs;
      }

      paint();

      searchEl.addEventListener('input', RM.debounce(function () {
        self._libPage = 1;
        paint();
      }, 120));
      sortEl.addEventListener('change', function () {
        self._libPage = 1;
        paint();
      });

      pagerHost.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (!btn) return;
        self._libPage = Number(btn.getAttribute('data-page'));
        paint();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      grid.addEventListener('click', function (e) {
        var favBtn = e.target.closest('[data-fav]');
        if (favBtn) {
          e.stopPropagation();
          self.toggleFav(user, favBtn.getAttribute('data-fav'));
          return;
        }
        var card = e.target.closest('.song-card');
        if (!card) return;
        var idx = Number(card.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        RM.Player.open(grid.__songs || current, idx);
      });
    },

    toggleFav: function (user, songId) {
      var on = RM.Store.toggleFavorite(user, songId);
      RM.toast(on ? '已收藏' : '已取消收藏');
      RM.rerender();
    },

    /* ---------------- 我的收藏 ---------------- */
    renderFavorites: function (main, user) {
      var self = this;
      self._favPage = 1;
      var favSongs = RM.Store.songsByIds(user.favorites || []);

      main.innerHTML =
        '<div class="page-head">' +
          '<h2>我的收藏</h2>' +
          '<p class="sub">共 ' + favSongs.length + ' 首收藏音乐</p>' +
        '</div>' +
        '<div class="song-grid" id="fav-grid"></div>' +
        '<div class="empty" id="fav-empty" hidden>还没有收藏任何歌曲，去音乐库点 ♡ 收藏吧</div>' +
        '<div id="fav-pager"></div>';

      var grid = main.querySelector('#fav-grid');
      var emptyEl = main.querySelector('#fav-empty');
      var pagerHost = main.querySelector('#fav-pager');
      var current = favSongs;

      function paint() {
        var paged = RM.pageSlice(current, self._favPage, 12);
        self._favPage = paged.page;

        if (!current.length) {
          grid.innerHTML = '';
          emptyEl.hidden = false;
          pagerHost.innerHTML = '';
          return;
        }
        emptyEl.hidden = true;

        grid.innerHTML = paged.items.map(function (s, i) {
          return self.cardHtml(s, i, user);
        }).join('');
        pagerHost.innerHTML = RM.pagerHtml(paged.page, paged.pages);
        grid.__songs = paged.items;
      }

      paint();

      pagerHost.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-page]');
        if (!btn) return;
        self._favPage = Number(btn.getAttribute('data-page'));
        paint();
      });

      grid.addEventListener('click', function (e) {
        var favBtn = e.target.closest('[data-fav]');
        if (favBtn) {
          e.stopPropagation();
          self.toggleFav(user, favBtn.getAttribute('data-fav'));
          return;
        }
        var card = e.target.closest('.song-card');
        if (!card) return;
        var idx = Number(card.getAttribute('data-idx'));
        if (isNaN(idx)) return;
        RM.Player.open(grid.__songs || current, idx);
      });
    },

    /* ---------------- 我的歌单 ---------------- */
    renderPlaylists: function (main, user) {
      var self = this;

      if (self._plView) {
        self.renderPlaylistDetail(main, user, self._plView);
        return;
      }

      var lists = user.playlists || [];

      main.innerHTML =
        '<div class="page-head">' +
          '<h2>我的歌单</h2>' +
          '<p class="sub">可以创建多个歌单，把喜欢的歌曲归类</p>' +
        '</div>' +
        '<form class="card form-grid" id="pl-form" style="max-width:640px">' +
          '<label class="field"><span>新建歌单</span>' +
            '<input type="text" id="pl-name" maxlength="20" placeholder="歌单名称（最多 20 字）" autocomplete="off">' +
          '</label>' +
          '<div class="form-actions"><button type="submit" class="btn btn-primary">创建歌单</button></div>' +
        '</form>' +
        '<div id="pl-list"></div>';

      var host = main.querySelector('#pl-list');

      function renderList() {
        var items = user.playlists || [];
        if (!items.length) {
          host.innerHTML = '<div class="empty">还没有歌单，先创建一个吧</div>';
          return;
        }
        host.innerHTML = items.map(function (p) {
          return '<div class="row-card" data-id="' + RM.escapeHtml(p.id) + '">' +
            '<div class="row-main">' +
              '<div class="row-title">' + RM.escapeHtml(p.name) + '</div>' +
              '<div class="row-sub">' + p.songIds.length + ' 首 · 创建于 ' +
                new Date(p.createdAt).toLocaleString() + '</div>' +
            '</div>' +
            '<div class="row-actions">' +
              '<button type="button" class="btn btn-sm btn-primary" data-act="play">播放</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" data-act="open">管理</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" data-act="rename">重命名</button>' +
              '<button type="button" class="btn btn-sm btn-danger" data-act="delete">删除</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      renderList();

      main.querySelector('#pl-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var input = main.querySelector('#pl-name');
        var res = RM.Store.createPlaylist(user, input.value);
        if (!res.ok) { RM.toast(res.msg, 'error'); return; }
        input.value = '';
        RM.toast('歌单已创建', 'ok');
        renderList();
      });

      host.addEventListener('click', async function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var card = btn.closest('[data-id]');
        var id = card.getAttribute('data-id');
        var p = (user.playlists || []).filter(function (x) { return x.id === id; })[0];
        if (!p) return;
        var act = btn.getAttribute('data-act');

        if (act === 'play') {
          var songs = RM.Store.songsByIds(p.songIds);
          if (!songs.length) { RM.toast('歌单里还没有歌曲', 'warn'); return; }
          RM.Player.open(songs, 0);
          return;
        }

        if (act === 'open') {
          self._plView = id;
          RM.rerender();
          return;
        }

        if (act === 'rename') {
          var val = await RM.prompt({
            title: '重命名歌单',
            label: '新的歌单名称',
            value: p.name,
            validate: function (v) {
              var name = String(v == null ? '' : v).trim();
              if (!name) return '歌单名称不能为空';
              if (name.length > 20) return '歌单名称不能超过 20 个字符';
              return null;
            }
          });
          if (val == null) return;
          var res = RM.Store.renamePlaylist(user, id, val);
          if (!res.ok) { RM.toast(res.msg, 'error'); return; }
          RM.toast('歌单已重命名', 'ok');
          renderList();
          return;
        }

        if (act === 'delete') {
          var ok = await RM.confirm({
            title: '删除歌单',
            message: '确定要删除歌单「' + p.name + '」吗？歌曲本身不会被删除。',
            confirmText: '删除',
            danger: true
          });
          if (!ok) return;
          RM.Store.deletePlaylist(user, id);
          RM.toast('歌单已删除');
          renderList();
        }
      });
    },

    renderPlaylistDetail: function (main, user, id) {
      var self = this;
      var p = (user.playlists || []).filter(function (x) { return x.id === id; })[0];

      if (!p) {
        self._plView = null;
        RM.rerender();
        return;
      }

      var songs = RM.Store.songsByIds(p.songIds);
      var allSongs = RM.Store.db.songs.slice();

      var options = allSongs.map(function (s) {
        return '<option value="' + RM.escapeHtml(s.id) + '">' +
          RM.escapeHtml(s.title) + '</option>';
      }).join('');

      main.innerHTML =
        '<div class="page-head">' +
          '<h2>' + RM.escapeHtml(p.name) + '</h2>' +
          '<p class="sub">共 ' + songs.length + ' 首歌曲</p>' +
        '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">' +
          '<button type="button" class="btn btn-primary" id="pl-play-all">播放全部</button>' +
          '<button type="button" class="btn btn-ghost" id="pl-back">返回歌单列表</button>' +
        '</div>' +
        '<div class="card" style="max-width:680px;margin-bottom:20px">' +
          '<h3 style="font-size:15px;margin-bottom:12px">添加歌曲</h3>' +
          (allSongs.length
            ? '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
                '<select id="pl-song-select" style="flex:1 1 240px">' + options + '</select>' +
                '<button type="button" class="btn btn-primary" id="pl-add-song">添加</button>' +
              '</div>'
            : '<div class="sub">音乐库中还没有歌曲</div>') +
        '</div>' +
        '<div id="pl-songs"></div>';

      var songHost = main.querySelector('#pl-songs');

      function renderSongs() {
        var list = RM.Store.songsByIds(p.songIds);
        if (!list.length) {
          songHost.innerHTML = '<div class="empty">歌单里还没有歌曲</div>';
          return;
        }
        songHost.innerHTML = list.map(function (s, i) {
          return '<div class="row-card" data-id="' + RM.escapeHtml(s.id) + '" data-idx="' + i + '">' +
            '<div class="row-main">' +
              '<div class="row-title">' + (i + 1) + '. ' + RM.escapeHtml(s.title) + '</div>' +
              '<div class="row-sub">' + RM.escapeHtml(s.url) + '</div>' +
            '</div>' +
            '<div class="row-actions">' +
              '<button type="button" class="btn btn-sm btn-ghost" data-act="play">播放</button>' +
              '<button type="button" class="btn btn-sm btn-danger" data-act="remove">移除</button>' +
            '</div>' +
          '</div>';
        }).join('');
      }

      renderSongs();

      main.querySelector('#pl-back').addEventListener('click', function () {
        self._plView = null;
        RM.rerender();
      });

      main.querySelector('#pl-play-all').addEventListener('click', function () {
        var list = RM.Store.songsByIds(p.songIds);
        if (!list.length) { RM.toast('歌单里还没有歌曲', 'warn'); return; }
        RM.Player.open(list, 0);
      });

      var addBtn = main.querySelector('#pl-add-song');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          var sel = main.querySelector('#pl-song-select');
          var res = RM.Store.addToPlaylist(user, p.id, sel.value);
          if (!res.ok) { RM.toast(res.msg, 'error'); return; }
          RM.toast('已添加到歌单', 'ok');
          renderSongs();
        });
      }

      songHost.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var card = btn.closest('[data-id]');
        var songId = card.getAttribute('data-id');
        var idx = Number(card.getAttribute('data-idx'));
        var act = btn.getAttribute('data-act');

        if (act === 'play') {
          var list = RM.Store.songsByIds(p.songIds);
          RM.Player.open(list, idx);
        } else if (act === 'remove') {
          RM.Store.removeFromPlaylist(user, p.id, songId);
          RM.toast('已从歌单移除');
          renderSongs();
        }
      });
    },

    /* ---------------- 个人资料 ---------------- */
    renderProfile: function (main, user) {
      var favCount = (user.favorites || []).length;
      var plCount = (user.playlists || []).length;
      var hisCount = (user.history || []).length;

      main.innerHTML =
        '<div class="page-head">' +
          '<h2>个人资料</h2>' +
          '<p class="sub">可以修改自己的用户名，UID 由系统分配不可修改</p>' +
        '</div>' +
        '<div class="card" style="max-width:560px;margin-bottom:20px">' +
          '<div class="row-card" style="box-shadow:none;padding:0 0 16px;margin-bottom:16px;border-bottom:1px solid var(--line)">' +
            '<div class="row-main">' +
              '<div class="row-title">当前用户名：' + RM.escapeHtml(user.username) + '</div>' +
              '<div class="row-sub">UID：' + RM.escapeHtml(user.uid) +
                (user.guest ? ' · 游客账户' : '') + '</div>' +
              '<div class="row-sub">收藏 ' + favCount + ' 首 · 歌单 ' + plCount +
                ' 个 · 最近播放 ' + hisCount + ' 首</div>' +
            '</div>' +
          '</div>' +
          '<form id="profile-form">' +
            '<label class="field"><span>新的用户名</span>' +
              '<input type="text" id="profile-name" value="' +
                RM.escapeHtml(user.username) + '" autocomplete="off">' +
            '</label>' +
            '<div class="form-msg" id="profile-msg"></div>' +
            '<button type="submit" class="btn btn-primary">保存用户名</button>' +
          '</form>' +
        '</div>' +
        (user.guest
          ? '<div class="notice notice-warn" style="max-width:560px">' +
              '游客账户首次登录后 24 小时自动销毁，届时将无法再登录。' +
            '</div>'
          : '') +
        '<div class="notice notice-info" style="max-width:560px">' +
          '演示站点：所有数据仅保存在当前浏览器中，清空浏览器缓存会恢复初始状态。' +
        '</div>';

      var form = main.querySelector('#profile-form');
      var msg = main.querySelector('#profile-msg');

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = main.querySelector('#profile-name').value.trim();

        var err = RM.validateUsername(name);
        if (err) { msg.textContent = err; msg.className = 'form-msg error'; return; }
        if (RM.Store.usernameExists(name, user.uid)) {
          msg.textContent = '该用户名已被占用（不区分英文大小写）';
          msg.className = 'form-msg error';
          return;
        }

        user.username = name;
        user.usernameLower = name.toLowerCase();
        RM.Store.save();

        msg.textContent = '用户名已更新';
        msg.className = 'form-msg ok';
        RM.toast('用户名已更新', 'ok');
        RM.rerender();
      });
    }
  };
})(window);