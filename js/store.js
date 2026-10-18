/* ============================================================
 * store.js —— 本地数据层（localStorage）
 * v3：标签 / 播放统计 / 通知 / 分享码 / 登录锁定 / 主色
 * ============================================================ */
(function (window) {
  'use strict';
  var RM = window.RM;

  var DB_KEY = 'RM_DB_V1';
  var SESSION_KEY = 'RM_SESSION_V1';
  var HASH_SALT = 'round-music-demo::v1::';

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  async function hashPassword(pw) {
    var input = HASH_SALT + String(pw) + '::end';
    try {
      if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        var buf = await window.crypto.subtle.digest(
          'SHA-256', new TextEncoder().encode(input)
        );
        var arr = Array.prototype.slice.call(new Uint8Array(buf));
        return 'sha256$' + arr.map(function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (e) {}

    var h1 = 0x811c9dc5 >>> 0;
    var h2 = 0x01000193 >>> 0;
    for (var i = 0; i < input.length; i++) {
      var c = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    return 'fnv$' + h1.toString(16) + h2.toString(16);
  }
  RM.hashPassword = hashPassword;

  var Store = RM.Store = {
    db: null,

    init: async function () {
      var loaded = null;
      try {
        var raw = localStorage.getItem(DB_KEY);
        if (raw) loaded = JSON.parse(raw);
      } catch (e) { loaded = null; }

      if (loaded && Array.isArray(loaded.users) && loaded.users.length) {
        this.db = loaded;
        this.migrate();
      } else {
        await this.seed();
      }
      this.sweep();
      this.save();
    },

    migrate: function () {
      var db = this.db;
      if (!Array.isArray(db.songs)) db.songs = [];
      if (!Array.isArray(db.invites)) db.invites = [];
      if (!Array.isArray(db.logs)) db.logs = [];
      if (!Array.isArray(db.announcements)) db.announcements = [];
      if (!db.settings) db.settings = {};
      if (!db.settings.accent) db.settings.accent = 'blue';
      if (!db.playStats || typeof db.playStats !== 'object') db.playStats = {};

      db.songs.forEach(function (s) {
        if (!Array.isArray(s.tags)) s.tags = [];
        if (typeof s.plays !== 'number') s.plays = 0;
      });

      db.users.forEach(function (u) {
        if (!Array.isArray(u.history)) u.history = [];
        if (!Array.isArray(u.favorites)) u.favorites = [];
        if (!Array.isArray(u.playlists)) u.playlists = [];
        if (!Array.isArray(u.readAnnouncements)) u.readAnnouncements = [];
        if (!Array.isArray(u.notifications)) u.notifications = [];
        if (!u.loginFail) u.loginFail = { count: 0, until: 0 };
        (u.playlists || []).forEach(function (p) {
          if (!p.shareCode) p.shareCode = '';
        });
      });

      db.version = 3;
    },

    seed: async function () {
      var now = Date.now();
      var adminHash = await hashPassword('xyy1314@');

      this.db = {
        version: 3,
        users: [
          {
            uid: '000000',
            username: '小鲨鱼',
            usernameLower: '小鲨鱼',
            passHash: adminHash,
            role: 'admin',
            status: 'active',
            createdAt: now,
            ban: { mode: 'none' },
            freeze: { mode: 'none' },
            guest: false,
            guestExpireAt: null,
            history: [],
            favorites: [],
            playlists: [],
            readAnnouncements: [],
            notifications: [],
            loginFail: { count: 0, until: 0 }
          }
        ],
        invites: [],
        songs: [
          {
            id: 'seed_song_1',
            title: '示例音乐 · 轻盈',
            url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            cover: '', tags: ['轻音乐'], plays: 0, addedAt: now
          },
          {
            id: 'seed_song_2',
            title: '示例音乐 · 微风',
            url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
            cover: '', tags: ['轻音乐'], plays: 0, addedAt: now - 1000
          },
          {
            id: 'seed_song_3',
            title: '示例音乐 · 晴空',
            url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
            cover: '', tags: ['纯音乐'], plays: 0, addedAt: now - 2000
          }
        ],
        logs: [],
        announcements: [],
        settings: { accent: 'blue' },
        playStats: {},
        meta: { createdAt: now }
      };
    },

    save: function () {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(this.db));
      } catch (e) {
        RM.toast('本地存储写入失败，可能是空间已满', 'error');
      }
    },

    sweep: function () {
      var now = Date.now();
      var changed = false;
      var removed = [];

      var before = this.db.users.length;
      this.db.users = this.db.users.filter(function (u) {
        if (u.guest && u.guestExpireAt && now >= u.guestExpireAt) {
          removed.push(u.uid);
          return false;
        }
        return true;
      });
      if (this.db.users.length !== before) changed = true;

      this.db.users.forEach(function (u) {
        if (u.ban && u.ban.mode === 'temp' && (u.ban.end || 0) <= now) {
          u.ban = { mode: 'none' }; changed = true;
        }
        if (u.freeze && u.freeze.mode === 'temp' && (u.freeze.end || 0) <= now) {
          u.freeze = { mode: 'none' }; changed = true;
        }
        if (u.history && u.history.length > 50) {
          u.history.length = 50; changed = true;
        }
        if (u.notifications && u.notifications.length > 100) {
          u.notifications.length = 100; changed = true;
        }
      });

      if (this.db.logs && this.db.logs.length > 500) {
        this.db.logs.length = 500; changed = true;
      }

      if (removed.length) {
        var s = this.getSession();
        if (s && removed.indexOf(s.uid) !== -1) this.clearSession();
      }
      if (changed) this.save();
      return changed;
    },

    getSession: function () {
      try {
        var raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (!s || !s.uid) return null;
        return s;
      } catch (e) { return null; }
    },
    setSession: function (s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); },
    clearSession: function () { localStorage.removeItem(SESSION_KEY); },
    currentUser: function () {
      var s = this.getSession();
      if (!s) return null;
      var u = this.getUserByUid(s.uid);
      if (!u) { this.clearSession(); return null; }
      return u;
    },
    getUserByUid: function (uid) {
      if (!this.db) return null;
      for (var i = 0; i < this.db.users.length; i++) {
        if (this.db.users[i].uid === uid) return this.db.users[i];
      }
      return null;
    },
    findUserByLogin: function (identifier) {
      var id = String(identifier == null ? '' : identifier).trim();
      if (!id) return null;
      var lower = id.toLowerCase();
      var byUid = this.getUserByUid(id);
      if (byUid) return byUid;
      for (var i = 0; i < this.db.users.length; i++) {
        if (this.db.users[i].usernameLower === lower) return this.db.users[i];
      }
      return null;
    },
    usernameExists: function (name, exceptUid) {
      var lower = String(name == null ? '' : name).trim().toLowerCase();
      if (!lower) return false;
      for (var i = 0; i < this.db.users.length; i++) {
        var u = this.db.users[i];
        if (u.uid === exceptUid) continue;
        if (u.usernameLower === lower) return true;
      }
      return false;
    },
    isUidTaken: function (uid, exceptUid) {
      for (var i = 0; i < this.db.users.length; i++) {
        var u = this.db.users[i];
        if (u.uid === exceptUid) continue;
        if (u.uid === uid) return true;
      }
      return false;
    },
    generateUid: function () {
      var taken = {};
      this.db.users.forEach(function (u) { taken[u.uid] = true; });
      taken['000000'] = true;
      for (var i = 0; i < 5000; i++) {
        var uid = RM.uid6();
        if (!taken[uid]) return uid;
      }
      for (var n = 100000; n <= 999999; n++) {
        var s = String(n);
        if (!taken[s]) return s;
      }
      return RM.uid6();
    },
    findInvite: function (code) {
      var c = String(code == null ? '' : code).trim();
      if (!c) return null;
      var lower = c.toLowerCase();
      for (var i = 0; i < this.db.invites.length; i++) {
        var inv = this.db.invites[i];
        if (String(inv.code).toLowerCase() === lower) return inv;
      }
      return null;
    },
    banState: function (u) {
      var b = u && u.ban;
      if (!b || !b.mode || b.mode === 'none') return { active: false };
      if (b.mode === 'perm') return { active: true, perm: true, remaining: Infinity };
      var rem = (b.end || 0) - Date.now();
      if (rem <= 0) return { active: false, expired: true };
      return { active: true, perm: false, remaining: rem, end: b.end };
    },
    freezeState: function (u) {
      var f = u && u.freeze;
      if (!f || !f.mode || f.mode === 'none') return { active: false };
      if (f.mode === 'perm') return { active: true, perm: true, remaining: Infinity };
      var rem = (f.end || 0) - Date.now();
      if (rem <= 0) return { active: false, expired: true };
      return { active: true, perm: false, remaining: rem, end: f.end };
    },
    removeUser: function (uid) {
      this.db.users = this.db.users.filter(function (u) { return u.uid !== uid; });
      var s = this.getSession();
      if (s && s.uid === uid) this.clearSession();
      this.save();
    },
    resetAll: async function () {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(SESSION_KEY);
      await this.init();
    },

    /* ============ 日志 ============ */
    addLog: function (action, target, detail) {
      if (!this.db) return;
      var u = this.currentUser();
      this.db.logs.unshift({
        id: RM.uid('log'), time: Date.now(),
        actor: u ? u.username : '系统',
        action: action || '', target: target || '', detail: detail || ''
      });
      if (this.db.logs.length > 500) this.db.logs.length = 500;
      this.save();
    },

    /* ============ 历史 ============ */
    pushHistory: function (user, songId) {
      if (!user || !songId) return;
      var h = (user.history || (user.history = []))
        .filter(function (x) { return x.songId !== songId; });
      h.unshift({ songId: songId, at: Date.now() });
      user.history = h.slice(0, 50);
      this.save();
    },

    /* ============ 收藏 ============ */
    isFavorite: function (user, songId) {
      return !!(user && Array.isArray(user.favorites) &&
        user.favorites.indexOf(songId) !== -1);
    },
    toggleFavorite: function (user, songId) {
      if (!user) return false;
      var f = user.favorites || (user.favorites = []);
      var i = f.indexOf(songId);
      if (i >= 0) { f.splice(i, 1); this.save(); return false; }
      f.push(songId); this.save(); return true;
    },

    /* ============ 歌曲 ============ */
    songById: function (id) {
      if (!this.db) return null;
      for (var i = 0; i < this.db.songs.length; i++) {
        if (this.db.songs[i].id === id) return this.db.songs[i];
      }
      return null;
    },
    songsByIds: function (ids) {
      var self = this;
      return (ids || []).map(function (id) { return self.songById(id); }).filter(Boolean);
    },
    incPlay: function (songId) {
      var s = this.songById(songId);
      if (s) s.plays = (s.plays || 0) + 1;
      if (!this.db.playStats) this.db.playStats = {};
      var k = todayKey();
      this.db.playStats[k] = (this.db.playStats[k] || 0) + 1;
      this.save();
    },
    allTags: function () {
      var map = {};
      this.db.songs.forEach(function (s) {
        (s.tags || []).forEach(function (t) { map[t] = true; });
      });
      return Object.keys(map);
    },

    /* ============ 歌单 ============ */
    createPlaylist: function (user, name) {
      var n = String(name == null ? '' : name).trim();
      if (!n) return { ok: false, msg: '歌单名称不能为空' };
      if (n.length > 20) return { ok: false, msg: '歌单名称不能超过 20 个字符' };
      var list = user.playlists || (user.playlists = []);
      var dup = list.some(function (p) { return p.name.toLowerCase() === n.toLowerCase(); });
      if (dup) return { ok: false, msg: '同名歌单已存在' };
      list.push({ id: RM.uid('pl'), name: n, songIds: [], createdAt: Date.now(), shareCode: '' });
      this.save();
      return { ok: true };
    },
    renamePlaylist: function (user, id, name) {
      var n = String(name == null ? '' : name).trim();
      if (!n) return { ok: false, msg: '歌单名称不能为空' };
      if (n.length > 20) return { ok: false, msg: '歌单名称不能超过 20 个字符' };
      var list = user.playlists || [];
      var dup = list.some(function (p) {
        return p.id !== id && p.name.toLowerCase() === n.toLowerCase();
      });
      if (dup) return { ok: false, msg: '同名歌单已存在' };
      var p = list.filter(function (x) { return x.id === id; })[0];
      if (!p) return { ok: false, msg: '歌单不存在' };
      p.name = n;
      this.save();
      return { ok: true };
    },
    deletePlaylist: function (user, id) {
      user.playlists = (user.playlists || []).filter(function (p) { return p.id !== id; });
      this.save();
    },
    addToPlaylist: function (user, id, songId) {
      var p = (user.playlists || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return { ok: false, msg: '歌单不存在' };
      if (p.songIds.indexOf(songId) !== -1) return { ok: false, msg: '该歌曲已在歌单中' };
      p.songIds.push(songId);
      this.save();
      return { ok: true };
    },
    removeFromPlaylist: function (user, id, songId) {
      var p = (user.playlists || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      p.songIds = p.songIds.filter(function (x) { return x !== songId; });
      this.save();
    },
    generateShareCode: function (user, playlistId) {
      var p = (user.playlists || []).filter(function (x) { return x.id === playlistId; })[0];
      if (!p) return { ok: false, msg: '歌单不存在' };
      var taken = {};
      this.db.users.forEach(function (u) {
        (u.playlists || []).forEach(function (pl) {
          if (pl.shareCode) taken[String(pl.shareCode).toUpperCase()] = true;
        });
      });
      var code = '', attempts = 0, chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      do {
        code = '';
        for (var i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        attempts++;
      } while (taken[code] && attempts < 60);
      p.shareCode = code;
      this.save();
      return { ok: true, code: code };
    },
    findPlaylistByShareCode: function (code) {
      var c = String(code == null ? '' : code).trim().toUpperCase();
      if (!c) return null;
      for (var i = 0; i < this.db.users.length; i++) {
        var u = this.db.users[i];
        for (var j = 0; j < (u.playlists || []).length; j++) {
          var p = u.playlists[j];
          if (p.shareCode && String(p.shareCode).toUpperCase() === c) {
            return { owner: u, playlist: p };
          }
        }
      }
      return null;
    },
    importPlaylistByShareCode: function (user, code) {
      var hit = this.findPlaylistByShareCode(code);
      if (!hit) return { ok: false, msg: '分享码无效或已失效' };
      if (hit.owner.uid === user.uid) return { ok: false, msg: '不能导入自己的歌单' };
      var src = hit.playlist;
      var list = user.playlists || (user.playlists = []);
      var name = src.name, base = name, idx = 2;
      while (list.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
        name = base + ' (' + idx + ')';
        idx++;
      }
      var newPl = {
        id: RM.uid('pl'), name: name,
        songIds: src.songIds.slice(),
        createdAt: Date.now(), shareCode: ''
      };
      list.push(newPl);
      this.save();
      return { ok: true, name: name, count: newPl.songIds.length };
    },

    /* ============ 公告 ============ */
    addAnnouncement: function (title, content, pinned) {
      var t = String(title == null ? '' : title).trim();
      var c = String(content == null ? '' : content).trim();
      if (!t) return { ok: false, msg: '公告标题不能为空' };
      if (!c) return { ok: false, msg: '公告内容不能为空' };
      this.db.announcements.unshift({
        id: RM.uid('ann'), title: t, content: c,
        pinned: !!pinned, enabled: true, createdAt: Date.now()
      });
      this.save();
      return { ok: true };
    },
    removeAnnouncement: function (id) {
      this.db.announcements = this.db.announcements.filter(function (a) { return a.id !== id; });
      this.save();
    },
    getAnnouncement: function (id) {
      for (var i = 0; i < this.db.announcements.length; i++) {
        if (this.db.announcements[i].id === id) return this.db.announcements[i];
      }
      return null;
    },

    /* ============ 通知 ============ */
    sendNotification: function (targetUid, title, content) {
      var t = String(title == null ? '' : title).trim();
      var c = String(content == null ? '' : content).trim();
      if (!t) return { ok: false, msg: '通知标题不能为空' };
      if (!c) return { ok: false, msg: '通知内容不能为空' };

      var targets = targetUid
        ? [this.getUserByUid(targetUid)].filter(Boolean)
        : this.db.users.filter(function (u) { return u.role !== 'admin'; });

      if (!targets.length) return { ok: false, msg: '没有可发送的目标用户' };

      targets.forEach(function (u) {
        if (!Array.isArray(u.notifications)) u.notifications = [];
        u.notifications.unshift({
          id: RM.uid('ntf'), title: t, content: c,
          at: Date.now(), read: false
        });
        if (u.notifications.length > 100) u.notifications.length = 100;
      });
      this.save();
      return { ok: true, count: targets.length };
    },
    markNotificationRead: function (user, id) {
      var n = (user.notifications || []).filter(function (x) { return x.id === id; })[0];
      if (!n) return;
      n.read = true;
      this.save();
    },
    unreadCount: function (user) {
      return (user && user.notifications ? user.notifications : [])
        .filter(function (n) { return !n.read; }).length;
    },
    markAllNotificationsRead: function (user) {
      (user.notifications || []).forEach(function (n) { n.read = true; });
      this.save();
    },

    /* ============ 设置 ============ */
    getAccent: function () {
      return (this.db && this.db.settings && this.db.settings.accent) || 'blue';
    },
    setAccent: function (name) {
      if (!this.db.settings) this.db.settings = {};
      this.db.settings.accent = name;
      this.save();
    },

    /* ============ 备份 ============ */
    exportJSON: function () { return JSON.stringify(this.db, null, 2); },
    importJSON: function (text) {
      var data;
      try { data = JSON.parse(text); }
      catch (e) { return { ok: false, msg: 'JSON 解析失败，文件格式不正确' }; }
      if (!data || !Array.isArray(data.users) || !data.users.length) {
        return { ok: false, msg: '数据缺少有效的 users 数组' };
      }
      if (!Array.isArray(data.songs)) data.songs = [];
      if (!Array.isArray(data.invites)) data.invites = [];
      this.db = data;
      this.migrate();
      this.sweep();
      this.save();
      return { ok: true };
    }
  };
})(window);