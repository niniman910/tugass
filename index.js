const express = require('express');

const session = require('express-session');

const sqlite3 = require('sqlite3').verbose();

const bcrypt = require('bcrypt');

const hbs = require('hbs');

const path = require('path');

const port = 3000;

const app = express();
app.set('view engine', 'hbs');
hbs.registerPartials(path.join(__dirname, 'views'));
hbs.registerHelper('eq', function (a, b) {
    return a === b;
});

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Koneksi database

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Database gagal:', err.message);
    } else {
        console.log('Database berhasil terhubung!');
    }
});
db.run('PRAGMA foreign_keys = ON');
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`, (err) => {
    if (err) console.error('Gagal membuat tabel users:', err.message);
});
db.run(`
    CREATE TABLE IF NOT EXISTS buku (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        judulbuku TEXT NOT NULL,
        penulis TEXT NOT NULL,
        kategori TEXT NOT NULL,
        tahunterbit INTEGER,
        isbn TEXT UNIQUE
    )
`, (err) => {
    if (err) console.error('Gagal membuat tabel buku:', err.message);
    else console.log('Tabel buku siap digunakan');
});
db.run(`
    CREATE TABLE IF NOT EXISTS siswa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nis TEXT UNIQUE NOT NULL,
        namasiswa TEXT NOT NULL,
        kelas TEXT NOT NULL,
        jurusan TEXT NOT NULL,
        alamat TEXT
    )
`, (err) => {
    if (err) console.error('Gagal membuat tabel siswa:', err.message);
    else console.log('Tabel siswa siap digunakan');
});
db.run(`
    CREATE TABLE IF NOT EXISTS peminjaman (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_siswa INTEGER NOT NULL,
        id_buku INTEGER NOT NULL,
        tanggalpinjam TEXT NOT NULL,
        tanggalkembali TEXT,
        status TEXT DEFAULT 'Dipinjam',
        FOREIGN KEY (id_siswa) REFERENCES siswa(id),
        FOREIGN KEY (id_buku) REFERENCES buku(id)
    )
`, (err) => {
    if (err) console.error('Gagal membuat tabel peminjaman:', err.message);
    else console.log('Tabel peminjaman siap digunakan');
});

// Middleware untuk halaman yang membutuhkan login

function userlogin(req, res, next) {
    if (req.session && req.session.username) {
        return next();
    }
    return res.redirect('/login');
}

// Halaman utama dan autentikasi

app.get('/', (req, res) => {
    if (req.session && req.session.username) {
        return res.redirect('/haruslogin');
    }
    return res.redirect('/login');
});

app.get('/tambahusers', (req, res) => {
    res.render('tambahusers');
});

app.post('/tambahusers', async (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    if (!username || !password) {
        return res.send('Username dan password wajib diisi!');
    }
    if (password.length < 6) {
        return res.send('Password minimal 6 karakter!');
    }
    try {
        const hashPassword = await bcrypt.hash(password, 10);
        db.run(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, hashPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.send('Username sudah digunakan!');
                    }
                    return res.send('Gagal membuat akun: ' + err.message);
                }
                return res.redirect('/login');
            }
        );
    } catch (err) {
        return res.send('Terjadi kesalahan saat membuat akun!');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    if (!username || !password) {
        return res.send('Username dan password wajib diisi!');
    }
    db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        async (err, user) => {
            if (err) {
                return res.send('Kesalahan database: ' + err.message);
            }
            if (!user) {
                return res.send('Username tidak ditemukan!');
            }
            try {
                const cocok = await bcrypt.compare(password, user.password);
                if (!cocok) {
                    return res.send('Password salah!');
                }
                req.session.username = user.username;

                req.session.save((sessionErr) => {
                    if (sessionErr) {
                        console.error('Gagal menyimpan session:', sessionErr);
                        return res.status(500).send('Gagal menyimpan session login!');
                    }

                    return res.redirect('/users');
                });
            } catch (error) {
                return res.send('Terjadi kesalahan saat memeriksa password!');
            }
        }
    );
});

app.get('/haruslogin', userlogin, (req, res) => {
    return res.redirect('/users');
});

app.get('/public', (req, res) => {
    res.send('Halaman public dapat diakses tanpa login.');
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send('Gagal logout!');
        }
        res.clearCookie('connect.sid');
        return res.redirect('/login');
    });
});

// CRUD Users

app.get('/users', userlogin, (req, res) => {
    db.all('SELECT id, username FROM users ORDER BY id DESC', [], (err, users) => {
        if (err) {
            return res.send('Gagal mengambil data users: ' + err.message);
        }
        res.render('users', { users });
    });
});

app.post('/hapususers/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT username FROM users WHERE id = ?', [id], (err, user) => {
        if (err) return res.send('Gagal memeriksa user: ' + err.message);
        if (!user) return res.send('User tidak ditemukan!');
        if (user.username === req.session.username) {
            return res.send('Kamu tidak dapat menghapus akun yang sedang digunakan!');
        }
        db.run('DELETE FROM users WHERE id = ?', [id], (deleteErr) => {
            if (deleteErr) {
                return res.send('Gagal menghapus user: ' + deleteErr.message);
            }
            return res.redirect('/users');
        });
    });
});

app.get('/editusers/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get(
        'SELECT id, username FROM users WHERE id = ?',
        [id],
        (err, user) => {
            if (err) return res.send('Gagal mengambil data user: ' + err.message);
            if (!user) return res.send('User tidak ditemukan');
            res.render('editusers', { user });
        }
    );
});

app.post('/editusers/:id', userlogin, async (req, res) => {
    const id = req.params.id;
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    if (!username) {
        return res.send('Username wajib diisi!');
    }
    db.get('SELECT * FROM users WHERE id = ?', [id], async (err, user) => {
        if (err) return res.send('Gagal mengambil user: ' + err.message);
        if (!user) return res.send('User tidak ditemukan!');
        try {
            let hashPassword = user.password;
            if (password.trim() !== '') {
                hashPassword = await bcrypt.hash(password, 10);
            }
            db.run(
                'UPDATE users SET username = ?, password = ? WHERE id = ?',
                [username, hashPassword, id],
                (updateErr) => {
                    if (updateErr) {
                        if (updateErr.message.includes('UNIQUE')) {
                            return res.send('Username sudah digunakan!');
                        }
                        return res.send('Gagal mengedit user: ' + updateErr.message);
                    }
                    if (req.session.username === user.username) {
                        req.session.username = username;
                    }
                    return res.redirect('/users');
                }
            );
        } catch (error) {
            return res.send('Terjadi kesalahan saat mengedit user!');
        }
    });
});

// CRUD Buku

app.get('/tambahbuku', userlogin, (req, res) => {
    res.render('tambahbuku');
});

app.post('/tambahbuku', userlogin, (req, res) => {
    const {
        judulbuku,
        penulis,
        kategori,
        tahunterbit,
        isbn
    } = req.body;
    if (!judulbuku || !penulis || !kategori) {
        return res.send('Judul buku, penulis, dan kategori wajib diisi!');
    }
    db.run(
        `INSERT INTO buku
        (judulbuku, penulis, kategori, tahunterbit, isbn)
        VALUES (?, ?, ?, ?, ?)`,
        [
            judulbuku.trim(),
            penulis.trim(),
            kategori.trim(),
            tahunterbit || null,
            isbn ? isbn.trim() : null
        ],
        (err) => {
            if (err) {
                return res.send('Gagal menyimpan buku: ' + err.message);
            }
            res.redirect('/buku');
        }
    );
});

app.get('/buku', userlogin, (req, res) => {
    db.all('SELECT * FROM buku ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            return res.send('Gagal mengambil data buku: ' + err.message);
        }
        res.render('buku', { buku: rows });
    });
});

app.get('/editbuku/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM buku WHERE id = ?', [id], (err, buku) => {
        if (err) return res.send('Gagal mengambil data buku: ' + err.message);
        if (!buku) return res.send('Buku tidak ditemukan');
        res.render('editbuku', { buku });
    });
});

app.post('/editbuku/:id', userlogin, (req, res) => {
    const id = req.params.id;
    const {
        judulbuku,
        penulis,
        tahunterbit,
        kategori,
        isbn
    } = req.body;
    if (!judulbuku || !penulis || !kategori) {
        return res.send('Judul buku, penulis, dan kategori wajib diisi!');
    }
    db.run(
        `UPDATE buku SET
            judulbuku = ?,
            penulis = ?,
            tahunterbit = ?,
            kategori = ?,
            isbn = ?
        WHERE id = ?`,
        [
            judulbuku.trim(),
            penulis.trim(),
            tahunterbit || null,
            kategori.trim(),
            isbn ? isbn.trim() : null,
            id
        ],
        (err) => {
            if (err) {
                return res.send('Gagal mengubah buku: ' + err.message);
            }
            res.redirect('/buku');
        }
    );
});

app.post('/hapusbuku/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get(
        'SELECT COUNT(*) AS jumlah FROM peminjaman WHERE id_buku = ?',
        [id],
        (err, data) => {
            if (err) {
                return res.send('Gagal memeriksa peminjaman: ' + err.message);
            }
            if (data.jumlah > 0) {
                return res.send('Buku tidak dapat dihapus karena memiliki riwayat peminjaman!');
            }
            db.run('DELETE FROM buku WHERE id = ?', [id], (deleteErr) => {
                if (deleteErr) {
                    return res.send('Gagal menghapus buku: ' + deleteErr.message);
                }
                res.redirect('/buku');
            });
        }
    );
});

// CRUD Siswa

app.get('/tambahsiswa', userlogin, (req, res) => {
    res.render('tambahsiswa');
});

app.post('/tambahsiswa', userlogin, (req, res) => {
    const {
        nis,
        namasiswa,
        kelas,
        jurusan,
        alamat
    } = req.body;
    if (!nis || !namasiswa || !kelas || !jurusan) {
        return res.send('NIS, nama siswa, kelas, dan jurusan wajib diisi!');
    }
    db.run(
        `INSERT INTO siswa
        (nis, namasiswa, kelas, jurusan, alamat)
        VALUES (?, ?, ?, ?, ?)`,
        [
            nis.trim(),
            namasiswa.trim(),
            kelas.trim(),
            jurusan.trim(),
            alamat || null
        ],
        (err) => {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.send('NIS sudah digunakan!');
                }
                return res.send('Gagal menambahkan siswa: ' + err.message);
            }
            res.redirect('/siswa');
        }
    );
});

app.get('/siswa', userlogin, (req, res) => {
    db.all('SELECT * FROM siswa ORDER BY id DESC', [], (err, rows) => {
        if (err) {
            return res.send('Gagal mengambil data siswa: ' + err.message);
        }
        res.render('siswa', { siswa: rows });
    });
});

app.get('/editsiswa/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM siswa WHERE id = ?', [id], (err, siswa) => {
        if (err) return res.send('Gagal mengambil data siswa: ' + err.message);
        if (!siswa) return res.send('Siswa tidak ditemukan');
        res.render('editsiswa', { siswa });
    });
});

app.post('/editsiswa/:id', userlogin, (req, res) => {
    const id = req.params.id;
    const {
        nis,
        namasiswa,
        kelas,
        jurusan,
        alamat
    } = req.body;
    if (!nis || !namasiswa || !kelas || !jurusan) {
        return res.send('NIS, nama siswa, kelas, dan jurusan wajib diisi!');
    }
    db.run(
        `UPDATE siswa SET
            nis = ?,
            namasiswa = ?,
            kelas = ?,
            jurusan = ?,
            alamat = ?
        WHERE id = ?`,
        [
            nis.trim(),
            namasiswa.trim(),
            kelas.trim(),
            jurusan.trim(),
            alamat || null,
            id
        ],
        (err) => {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.send('NIS sudah digunakan!');
                }
                return res.send('Gagal mengedit siswa: ' + err.message);
            }
            res.redirect('/siswa');
        }
    );
});

app.post('/hapussiswa/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get(
        'SELECT COUNT(*) AS jumlah FROM peminjaman WHERE id_siswa = ?',
        [id],
        (err, data) => {
            if (err) {
                return res.send('Gagal memeriksa peminjaman: ' + err.message);
            }
            if (data.jumlah > 0) {
                return res.send(
                    'Siswa tidak dapat dihapus karena memiliki riwayat peminjaman!'
                );
            }
            db.run('DELETE FROM siswa WHERE id = ?', [id], (deleteErr) => {
                if (deleteErr) {
                    return res.send('Gagal menghapus siswa: ' + deleteErr.message);
                }
                res.redirect('/siswa');
            });
        }
    );
});

// CRUD Peminjaman

app.get('/tambahpeminjaman', userlogin, (req, res) => {
    db.all('SELECT * FROM siswa ORDER BY namasiswa ASC', [], (err, siswa) => {
        if (err) {
            return res.send('Gagal mengambil data siswa: ' + err.message);
        }
        db.all('SELECT * FROM buku ORDER BY judulbuku ASC', [], (bookErr, buku) => {
            if (bookErr) {
                return res.send('Gagal mengambil data buku: ' + bookErr.message);
            }
            res.render('tambahpeminjaman', { siswa, buku });
        });
    });
});

app.post('/tambahpeminjaman', userlogin, (req, res) => {
    const {
        id_siswa,
        id_buku,
        tanggalpinjam,
        tanggalkembali
    } = req.body;
    if (!id_siswa || !id_buku || !tanggalpinjam) {
        return res.send('Siswa, buku, dan tanggal pinjam wajib diisi!');
    }
    db.run(
        `INSERT INTO peminjaman
        (id_siswa, id_buku, tanggalpinjam, tanggalkembali, status)
        VALUES (?, ?, ?, ?, ?)`,
        [
            id_siswa,
            id_buku,
            tanggalpinjam,
            tanggalkembali || null,
            'Dipinjam'
        ],
        (err) => {
            if (err) {
                return res.send('Gagal menambahkan peminjaman: ' + err.message);
            }
            res.redirect('/peminjaman');
        }
    );
});

app.get('/peminjaman', userlogin, (req, res) => {
    db.all(
        `SELECT
            peminjaman.id,
            peminjaman.id_siswa,
            peminjaman.id_buku,
            siswa.nis,
            siswa.namasiswa,
            siswa.kelas,
            buku.judulbuku,
            buku.penulis,
            peminjaman.tanggalpinjam,
            peminjaman.tanggalkembali,
            peminjaman.status
        FROM peminjaman
        JOIN siswa ON peminjaman.id_siswa = siswa.id
        JOIN buku ON peminjaman.id_buku = buku.id
        ORDER BY peminjaman.id DESC`,
        [],
        (err, rows) => {
            if (err) {
                return res.send('Gagal mengambil data peminjaman: ' + err.message);
            }
            res.render('peminjaman', { peminjaman: rows });
        }
    );
});

app.get('/editpeminjaman/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM peminjaman WHERE id = ?', [id], (err, peminjaman) => {
        if (err) {
            return res.send('Gagal mengambil data peminjaman: ' + err.message);
        }
        if (!peminjaman) {
            return res.send('Data peminjaman tidak ditemukan');
        }
        db.all('SELECT * FROM siswa ORDER BY namasiswa ASC', [], (siswaErr, siswa) => {
            if (siswaErr) {
                return res.send('Gagal mengambil data siswa: ' + siswaErr.message);
            }
            db.all('SELECT * FROM buku ORDER BY judulbuku ASC', [], (bukuErr, buku) => {
                if (bukuErr) {
                    return res.send('Gagal mengambil data buku: ' + bukuErr.message);
                }
                res.render('editpeminjaman', {
                    peminjaman,
                    siswa,
                    buku
                });
            });
        });
    });
});

app.post('/editpeminjaman/:id', userlogin, (req, res) => {
    const id = req.params.id;
    const {
        id_siswa,
        id_buku,
        tanggalpinjam,
        tanggalkembali,
        status
    } = req.body;
    if (!id_siswa || !id_buku || !tanggalpinjam || !status) {
        return res.send('Data peminjaman wajib diisi!');
    }
    db.run(
        `UPDATE peminjaman
         SET id_siswa = ?,
             id_buku = ?,
             tanggalpinjam = ?,
             tanggalkembali = ?,
             status = ?
         WHERE id = ?`,
        [
            id_siswa,
            id_buku,
            tanggalpinjam,
            tanggalkembali || null,
            status,
            id
        ],
        (err) => {
            if (err) {
                return res.send('Gagal mengubah data peminjaman: ' + err.message);
            }
            res.redirect('/peminjaman');
        }
    );
});

app.post('/hapuspeminjaman/:id', userlogin, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM peminjaman WHERE id = ?', [id], (err) => {
        if (err) {
            return res.send('Gagal menghapus peminjaman: ' + err.message);
        }
        res.redirect('/peminjaman');
    });
});



app.use((req, res) => {
    res.status(404).send('Halaman tidak ditemukan: ' + req.originalUrl);
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Terjadi kesalahan pada server!');
});

app.listen(port, () => {
    console.log(`Server berjalan: http://localhost:${port}/login`);
});