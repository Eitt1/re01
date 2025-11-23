const express = require('express');
const app = express();
const fs = require('node:fs/promises');
const formidable = require('express-formidable');
const { MongoClient, ObjectId } = require("mongodb");
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;

// === 1. Passport & Session 配置 (必须在路由之前) ===
app.use(session({
    secret: "MediaCloudSecretKey", // 建议修改为复杂的随机字符串
    resave: true,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// Facebook 策略配置
const facebookAuth = {
    'clientID': '834176075664884', // 替换为你的 Facebook App ID
    'clientSecret': 'a01e9524882a0e386dcb092c5fa3a9f8', // 替换为你的 Facebook App Secret
    'callbackURL': 'http://localhost:8099/auth/facebook/callback'
};

// 序列化用户
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new FacebookStrategy({
    clientID: facebookAuth.clientID,
    clientSecret: facebookAuth.clientSecret,
    callbackURL: facebookAuth.callbackURL,
    profileFields: ['id', 'displayName', 'photos'] // 获取头像需要这个字段
}, function (token, refreshToken, profile, done) {
    // 构建用户对象
    const user = {
        id: profile.id,
        name: profile.displayName,
        photo: profile.photos ? profile.photos[0].value : null, // 获取头像URL
        type: 'facebook'
    };
    return done(null, user);
}));

// === 2. 基础中间件 ===
app.set('view engine', 'ejs');
app.use('/public', express.static('public'));

// !!! 关键中间件：将 user 对象注入到所有模板中 !!!
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Formidable 用于处理文件上传
app.use(formidable());

// === 3. 数据库配置 ===
const mongourl = 'mongodb+srv://heying:fjk12380@cluster0.zrabk1y.mongodb.net/media_cloud?retryWrites=true&w=majority';
const client = new MongoClient(mongourl);
const dbName = 'media_cloud';
const collectionName = "media_files";

const getDB = async () => {
    if (!client.topology || !client.topology.isConnected()) {
        await client.connect();
    }
    return client.db(dbName);
};

// === 4. 路由逻辑 ===

// === RESTful API Services (无需身份验证) ===

// 1. GET (Read) - 获取所有或搜索
app.get('/api/files', async (req, res) => {
    const db = await getDB();
    const query = {};
    // 支持简单搜索: /api/files?filename=xxx
    if (req.query.filename) {
        query.filename = { $regex: req.query.filename, $options: 'i' };
    }
    const docs = await db.collection(collectionName).find(query).toArray();
    res.status(200).json(docs);
});

// 2. POST (Create) - 创建新文件
// 注意：API通常接收JSON，这里假设客户端发JSON或Form
app.post('/api/files', async (req, res) => {
    const db = await getDB();
    try {
        const newDoc = {
            filename: req.fields.filename || 'Untitled',
            description: req.fields.description || '',
            createdAt: new Date()
        };
        // 简化API处理，暂时忽略文件二进制流，只存元数据演示
        const result = await db.collection(collectionName).insertOne(newDoc);
        res.status(201).json({ message: 'Created', id: result.insertedId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. PUT (Update) - 更新文件
app.put('/api/files/:id', async (req, res) => {
    const db = await getDB();
    try {
        const { id } = req.params;
        const updateData = {
            $set: {
                filename: req.fields.filename,
                description: req.fields.description,
                updatedAt: new Date()
            }
        };
        const result = await db.collection(collectionName).updateOne(
            { _id: new ObjectId(id) },
            updateData
        );
        res.status(200).json({ message: 'Updated', modified: result.modifiedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. DELETE (Delete) - 删除文件
app.delete('/api/files/:id', async (req, res) => {
    const db = await getDB();
    try {
        const { id } = req.params;
        const result = await db.collection(collectionName).deleteOne({ _id: new ObjectId(id) });
        res.status(200).json({ message: 'Deleted', deleted: result.deletedCount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// 辅助函数：确保已登录 (核心保护逻辑)
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    // 未登录，强制重定向到登录页
    res.redirect('/login');
}

// --- Auth Routes (认证路由) ---
app.get("/auth/facebook", passport.authenticate("facebook"));

app.get("/auth/facebook/callback",
    passport.authenticate("facebook", {
        successRedirect: "/list",
        failureRedirect: "/login"
    })
);

app.get("/logout", (req, res, next) => {
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/login'); // 登出后回到登录页
    });
});

// --- 业务路由 ---

// 1. 登录页 (如果已登录，直接跳列表，防止重复登录)
app.get('/login', (req, res) => {
    if (req.isAuthenticated()) {
        return res.redirect('/list');
    }
    res.render('login');
});

// 2. 根目录 (默认入口 -> 检查登录)
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/list');
    } else {
        res.redirect('/login');
    }
});

// 3. 列表页 (首页) - 现在受到保护
app.get('/list', isLoggedIn, async (req, res) => {
    const db = await getDB();
    const docs = await db.collection(collectionName).find({}).toArray();
    res.render('list', { files: docs });
});

// 4. 上传页 (Create) - 受到保护
app.get('/create', isLoggedIn, (req, res) => {
    res.render('create');
});

app.post('/create', isLoggedIn, async (req, res) => {
    const db = await getDB();
    let newDoc = {
        filename: req.fields.filename || 'Notdefine',
        description: req.fields.description || '',
        uploadedAt: new Date(),
        uploader: req.user.name // 记录上传者名字
    };

    if (req.files.filetoupload && req.files.filetoupload.size > 0) {
        const data = await fs.readFile(req.files.filetoupload.path);
        const ext = req.files.filetoupload.name.split('.').pop().toLowerCase();
        newDoc.mimetype = (ext === 'mp3') ? 'audio/mpeg' : (ext === 'mp4' ? 'video/mp4' : 'application/octet-stream');
        newDoc.file = Buffer.from(data).toString('base64');
    }

    await db.collection(collectionName).insertOne(newDoc);
    res.redirect('/list');
});

// 5. 详情页 - 受到保护
app.get('/details', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('details', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

// 6. 编辑页 - 受到保护
app.get('/edit', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('edit', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

app.post('/update', isLoggedIn, async (req, res) => {
    const db = await getDB();
    const updateDoc = {
        filename: req.fields.filename,
        description: req.fields.description,
        updatedAt: new Date()
    };

    if (req.files.filetoupload && req.files.filetoupload.size > 0) {
        const data = await fs.readFile(req.files.filetoupload.path);
        const ext = req.files.filetoupload.name.split('.').pop().toLowerCase();
        updateDoc.mimetype = (ext === 'mp3') ? 'audio/mpeg' : 'video/mp4';
        updateDoc.file = Buffer.from(data).toString('base64');
    }

    try {
        await db.collection(collectionName).updateOne({ _id: new ObjectId(req.fields._id) }, { $set: updateDoc });
        res.redirect(`/details?_id=${req.fields._id}`);
    } catch (e) {
        res.render('info', { message: 'Update failed' });
    }
});

// 7. 删除页 - 受到保护
app.get('/delete', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('delete', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

app.post('/delete', isLoggedIn, async (req, res) => {
    const db = await getDB();
    try {
        await db.collection(collectionName).deleteOne({ _id: new ObjectId(req.fields._id) });
        res.redirect('/list');
    } catch (e) {
        res.render('info', { message: 'Delete failed' });
    }
});

// 兜底路由 - 任何未定义的路由都跳回首页(会被首页重定向逻辑捕获)
app.get(/(.*)/, (req, res) => {
    res.redirect('/');
});


const port = process.env.PORT || 8099;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
