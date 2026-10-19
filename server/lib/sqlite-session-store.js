import session from 'express-session';

export class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions(expires);
    `);
    this.select = db.prepare('SELECT sess, expires FROM admin_sessions WHERE sid = ?');
    this.upsert = db.prepare(`
      INSERT INTO admin_sessions (sid, sess, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
    `);
    this.remove = db.prepare('DELETE FROM admin_sessions WHERE sid = ?');
    this.removeExpired = db.prepare('DELETE FROM admin_sessions WHERE expires <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.select.get(sid);
      if (!row || row.expires <= Date.now()) {
        if (row) this.remove.run(sid);
        callback(null, null);
        return;
      }
      callback(null, JSON.parse(row.sess));
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expires = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + Number(sess.cookie?.maxAge || 28_800_000);
      this.upsert.run(sid, JSON.stringify(sess), expires);
      this.removeExpired.run(Date.now());
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    this.set(sid, sess, callback);
  }

  destroy(sid, callback = () => {}) {
    try {
      this.remove.run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}
