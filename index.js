const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const hbs = require('hbs');

hbs.registerHelper('eq', function (a, b) {
    return a === b;
});

const port = 3000;
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'hbs');

app.use(session({
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.log('Database gagal:', err.message);
    } else {
        console.log('Database berhasil terhubung!');
    }
});

// TABEL USERS
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`);

// TABEL BUKU
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
    if (err) {
        console.log(err);
    } else {
        console.log('Tabel buku berhasil dibuat');
    }
});

// TABEL SISWA
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
    if (err) {
        console.log('Gagal membuat tabel siswa:', err.message);
    } else {
        console.log('Tabel siswa berhasil dibuat');
    }
});

// TABEL PEMINJAMAN
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
    if (err) {
        console.log('Gagal membuat tabel peminjaman:', err.message);
    } else {
        console.log('Tabel peminjaman berhasil dibuat');
    }
});


function userlogin(req, res, next) {
    if (req.session.username) {
        next();
    } else {
        return res.send('hayoloh');
    }
}
// LOGIN
app.get('/login', (req, res) => {
    return res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.send('Username dan password wajib diisi!');
    }

    db.get(
        'SELECT * FROM users WHERE username = ?',
        [username.trim()],
        async (err, data) => {
            if (err) {
                return res.send('Kesalahan database!');
            }

            if (!data) {
                return res.send('Username tidak ditemukan!');
            }

            try {
                const cocok = await bcrypt.compare(
                    password,
                    data.password
                );

                if (cocok) {
                    req.session.username = data.username;
                    return res.redirect('/haruslogin');
                }

                return res.send('Password salah!');

            } catch (err) {
                return res.send('Terjadi kesalahan!');
            }
        }
    );
});

// ROUTE HARUS LOGIN
app.get('/haruslogin', userlogin, (req, res) => {
    console.log(req.session.username);

    return res.send(
        'Berhasil login ygy! Selamat datang ' + req.session.username
    );
});

// ROUTE PUBLIC
app.get('/public', (req, res) => {
    console.log(req.session.username);

    return res.send('anda login tanpa login');
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send('Gagal logout!');
        }

        return res.redirect('/login');
    });
});

// USERS
app.get('/users', (req, res) => {
    db.all('SELECT * FROM users', [], (err, users) => {
        if (err) {
            return res.send('Gagal mengambil data users');
        }

        res.render('users', { users });
    });
});

app.post('/hapususers/:id', (req, res) => {
    const id = req.params.id;

    db.run(
        'DELETE FROM users WHERE id = ?',
        [id],
        (err) => {
            if (err) {
                return res.send('Gagal menghapus user');
            }

            res.redirect('/users');
        }
    );
});

app.get('/editusers/:id', (req, res) => {
    const id = req.params.id;

    db.get(
        'SELECT * FROM users WHERE id = ?',
        [id],
        (err, user) => {
            if (err || !user) {
                return res.send('User tidak ditemukan');
            }

            res.render('editusers', { user });
        }
    );
});

app.post('/editusers/:id', async (req, res) => {
    const id = req.params.id;
    const { username, password } = req.body;

    try {
        const hashPassword = await bcrypt.hash(password, 10);

        db.run(
            'UPDATE users SET username = ?, password = ? WHERE id = ?',
            [username, hashPassword, id],
            (err) => {
                if (err) {
                    return res.send('Gagal mengedit user');
                }

                res.redirect('/users');
            }
        );

    } catch (err) {
        res.send('Terjadi kesalahan');
    }
});

// TAMBAH BUKU
app.get('/tambahbuku', (req, res) => {
    res.render('tambahbuku');
});

app.post('/tambahbuku', (req, res) => {
    const {
        judulbuku,
        penulis,
        kategori,
        tahunterbit,
        isbn
    } = req.body;

    db.run(
        `INSERT INTO buku
        (judulbuku, penulis, kategori, tahunterbit, isbn)
        VALUES (?, ?, ?, ?, ?)`,
        [judulbuku, penulis, kategori, tahunterbit, isbn],
        (err) => {
            if (err) {
                return res.send('Gagal menyimpan buku: ' + err.message);
            }

            res.redirect('/buku');
        }
    );
});

// DAFTAR BUKU
app.get('/buku', (req, res) => {
    db.all('SELECT * FROM buku', [], (err, rows) => {
        if (err) {
            return res.send('Gagal mengambil data buku');
        }

        res.render('buku', { buku: rows });
    });
});
// EDIT BUKU
app.get('/editbuku/:id', (req, res) => {
    const id = req.params.id;

    db.get(
        'SELECT * FROM buku WHERE id = ?',
        [id],
        (err, buku) => {
            if (err) {
                return res.send('Gagal mengambil data buku');
            }

            if (!buku) {
                return res.send('Buku tidak ditemukan');
            }

            res.render('editbuku', { buku });
        }
    );
});

app.post('/editbuku/:id', (req, res) => {
    const id = req.params.id;

    const {
        judulbuku,
        penulis,
        tahunterbit,
        kategori,
        isbn
    } = req.body;

    db.run(
        `UPDATE buku SET
            judulbuku = ?,
            penulis = ?,
            tahunterbit = ?,
            kategori = ?,
            isbn = ?
        WHERE id = ?`,

        [
            judulbuku,
            penulis,
            tahunterbit,
            kategori,
            isbn,
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

// HAPUS BUKU
app.post('/hapusbuku/:id', (req, res) => {
    const id = req.params.id;

    db.run(
        'DELETE FROM buku WHERE id = ?',
        [id],
        (err) => {
            if (err) {
                return res.send('Gagal menghapus buku: ' + err.message);
            }

            res.redirect('/buku');
        }
    );
});



// TAMBAH SISWA
app.get('/tambahsiswa', (req, res) => {
    res.render('tambahsiswa');
});

app.post('/tambahsiswa', (req, res) => {
    const {
        nis,
        namasiswa,
        kelas,
        jurusan,
        alamat
    } = req.body;

    if (!nis || !namasiswa || !kelas || !jurusan) {
        return res.send('Semua data wajib diisi!');
    }

    db.run(
        `INSERT INTO siswa
        (nis, namasiswa, kelas, jurusan, alamat)
        VALUES (?, ?, ?, ?, ?)`,

        [nis, namasiswa, kelas, jurusan, alamat],

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

// DAFTAR SISWA
app.get('/siswa', (req, res) => {
    db.all(
        'SELECT * FROM siswa ORDER BY id DESC',
        [],
        (err, rows) => {
            if (err) {
                return res.send('Gagal mengambil data siswa: ' + err.message);
            }

            res.render('siswa', { siswa: rows });
        }
    );
});

// EDIT SISWA
app.get('/editsiswa/:id', (req, res) => {
    const id = req.params.id;

    db.get(
        'SELECT * FROM siswa WHERE id = ?',
        [id],
        (err, siswa) => {
            if (err) {
                return res.send('Gagal mengambil data siswa');
            }

            if (!siswa) {
                return res.send('Siswa tidak ditemukan');
            }

            res.render('editsiswa', { siswa });
        }
    );
});

app.post('/editsiswa/:id', (req, res) => {
    const id = req.params.id;

    const {
        nis,
        namasiswa,
        kelas,
        jurusan,
        alamat
    } = req.body;

    db.run(
        `UPDATE siswa SET
            nis = ?,
            namasiswa = ?,
            kelas = ?,
            jurusan = ?,
            alamat = ?
        WHERE id = ?`,

        [nis, namasiswa, kelas, jurusan, alamat, id],

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

// HAPUS SISWA
app.post('/hapussiswa/:id', (req, res) => {
    const id = req.params.id;

    db.get(
        'SELECT COUNT(*) AS jumlah FROM peminjaman WHERE id_siswa = ?',
        [id],
        (err, data) => {
            if (err) {
                return res.send('Gagal memeriksa data peminjaman');
            }

            if (data.jumlah > 0) {
                return res.send(
                    'Siswa tidak dapat dihapus karena memiliki riwayat peminjaman!'
                );
            }

            db.run(
                'DELETE FROM siswa WHERE id = ?',
                [id],
                (err) => {
                    if (err) {
                        return res.send('Gagal menghapus siswa: ' + err.message);
                    }

                    res.redirect('/siswa');
                }
            );
        }
    );
});
// TAMBAH PEMINJAMAN
app.get('/tambahpeminjaman', (req, res) => {
    db.all(
        'SELECT * FROM siswa ORDER BY namasiswa ASC',
        [],
        (err, siswa) => {
            if (err) {
                return res.send('Gagal mengambil data siswa');
            }

            db.all(
                'SELECT * FROM buku ORDER BY judulbuku ASC',
                [],
                (err, buku) => {
                    if (err) {
                        return res.send('Gagal mengambil data buku');
                    }

                    res.render('tambahpeminjaman', {
                        siswa,
                        buku
                    });
                }
            );
        }
    );
});

app.post('/tambahpeminjaman', (req, res) => {
    const {
        id_siswa,
        id_buku,
        tanggalpinjam,
        tanggalkembali
    } = req.body;

    if (!id_siswa || !id_buku || !tanggalpinjam) {
        return res.send('Data peminjaman wajib diisi!');
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
                return res.send(
                    'Gagal menambahkan peminjaman: ' + err.message
                );
            }

            res.redirect('/peminjaman');
        }
    );
});

// HALAMAN EDIT PEMINJAMAN
app.get('/editpeminjaman/:id', (req, res) => {
    const id = req.params.id;

    db.get(
        'SELECT * FROM peminjaman WHERE id = ?',
        [id],
        (err, peminjaman) => {
            if (err) {
                return res.send('Gagal mengambil data peminjaman');
            }

            if (!peminjaman) {
                return res.send('Data peminjaman tidak ditemukan');
            }

            db.all(
                'SELECT * FROM siswa',
                [],
                (err, siswa) => {
                    if (err) {
                        return res.send('Gagal mengambil data siswa');
                    }

                    db.all(
                        'SELECT * FROM buku',
                        [],
                        (err, buku) => {
                            if (err) {
                                return res.send('Gagal mengambil data buku');
                            }

                            res.render('editpeminjaman', {
                                peminjaman,
                                siswa,
                                buku
                            });
                        }
                    );
                }
            );
        }
    );
});

// PROSES UPDATE PEMINJAMAN
app.post('/editpeminjaman/:id', (req, res) => {
    const {
        id_siswa,
        id_buku,
        tanggalpinjam,
        tanggalkembali,
        status
    } = req.body;

    const id = req.params.id;

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
            tanggalkembali,
            status,
            id
        ],

        (err) => {
            if (err) {
                return res.send(
                    'Gagal mengubah data peminjaman: ' + err.message
                );
            }

            res.redirect('/peminjaman');
        }
    );
});

// DAFTAR PEMINJAMAN
app.get('/peminjaman', (req, res) => {
    db.all(
        `SELECT
            peminjaman.id,
            siswa.nis,
            siswa.namasiswa,
            siswa.kelas,
            buku.judulbuku,
            buku.penulis,
            peminjaman.tanggalpinjam,
            peminjaman.tanggalkembali,
            peminjaman.status

        FROM peminjaman

        JOIN siswa
        ON peminjaman.id_siswa = siswa.id

        JOIN buku
        ON peminjaman.id_buku = buku.id

        ORDER BY peminjaman.id DESC`,

        [],

        (err, rows) => {
            if (err) {
                return res.send(
                    'Gagal mengambil data peminjaman: ' + err.message
                );
            }

            res.render('peminjaman', {
                peminjaman: rows
            });
        }
    );
});

// HAPUS PEMINJAMAN
app.post('/hapuspeminjaman/:id', (req, res) => {
    const id = req.params.id;

    db.run(
        'DELETE FROM peminjaman WHERE id = ?',
        [id],
        (err) => {
            if (err) {
                return res.send(
                    'Gagal menghapus peminjaman: ' + err.message
                );
            }

            res.redirect('/peminjaman');
        }
    );
});

// MENJALANKAN SERVER
app.listen(port, () => {
    console.log(`Server: http://localhost:${port}/login`);
});