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
    'clientID': '902102522477336', // 替换为你的 Facebook App ID
    'clientSecret': '267a3fdc14c82f38f5b45ed333cc95ef', // 替换为你的 Facebook App Secret
    'callbackURL': 'https://re01.onrender.com/auth/facebook/callback'
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
// 设置视图引擎
app.set('view engine', 'ejs');

// 静态文件
app.use('/public', express.static('public'));

// !!! 关键中间件：将 user 对象注入到所有模板中 !!!
// 这样我们在 EJS 里就可以直接用 if(user) 来判断登录状态
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Formidable 用于处理文件上传
// 注意：Formidable 可能会干扰 body 解析，但因为 Facebook Login 主要靠 URL 跳转，影响不大。
// 放在 passport 之后以防万一。
app.use(formidable());

// === 3. 数据库配置 ===
const mongourl = 'mongodb+srv://heying:fjk12380@cluster0.zrabk1y.mongodb.net/media_cloud?retryWrites=true&w=majority';
const client = new MongoClient(mongourl);
const dbName = 'media_cloud';
const collectionName = "media_files";

const getDB = async () => {
    // 建议：实际生产中最好在启动时连接一次，而不是每次请求都连接
    if (!client.topology || !client.topology.isConnected()) {
        await client.connect();
    }
    return client.db(dbName);
};

// === 4. 路由逻辑 ===

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
        res.redirect('/');
    });
});

// 辅助函数：确保已登录 (可选：如果你想保护某些页面)
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

// --- 业务路由 ---

// 1. 登录页
app.get('/login', (req, res) => {
    res.render('login');
});

// 2. 列表页 (首页)
app.get('/list', async (req, res) => {
    const db = await getDB();
    const docs = await db.collection(collectionName).find({}).toArray();
    res.render('list', { files: docs }); // user 已经在 res.locals 里了
});

// 3. 上传页 (Create) - 建议加上 isLoggedIn 保护
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

// 4. 详情页
app.get('/details', async (req, res) => {
    const db = await getDB();
    try {
        const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
        doc ? res.render('details', { file: doc }) : res.render('info', { message: 'File not found' });
    } catch (e) {
        res.render('info', { message: 'Invalid ID' });
    }
});

// 5. 编辑页 - 加上 isLoggedIn
app.get('/edit', isLoggedIn, async (req, res) => {
    const db = await getDB();
    const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
    doc ? res.render('edit', { file: doc }) : res.render('info', { message: 'File not found' });
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

    await db.collection(collectionName).updateOne({ _id: new ObjectId(req.fields._id) }, { $set: updateDoc });
    res.redirect(`/details?_id=${req.fields._id}`);
});

// 6. 删除页 - 加上 isLoggedIn
app.get('/delete', isLoggedIn, async (req, res) => {
    const db = await getDB();
    const doc = await db.collection(collectionName).findOne({ _id: new ObjectId(req.query._id) });
    doc ? res.render('delete', { file: doc }) : res.render('info', { message: 'File not found' });
});

app.post('/delete', isLoggedIn, async (req, res) => {
    const db = await getDB();
    await db.collection(collectionName).deleteOne({ _id: new ObjectId(req.fields._id) });
    res.redirect('/list');
});

// 根目录重定向
app.get('/', (req, res) => res.redirect('/list'));

const port = process.env.PORT || 8099;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

