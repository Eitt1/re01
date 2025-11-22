// 引入所需模块
var express = require('express'),                    // Express Web 框架
    app = express(),                               // 创建 Express 应用实例
    passport = require('passport'),                // Passport 认证中间件
    FacebookStrategy = require('passport-facebook').Strategy,  // Facebook 登录策略
    session = require('express-session');         // 会话支持（用来保存登录状态）

// Facebook 应用信息（需要在 https://developers.facebook.com/apps/ 创建应用后填写）
var facebookAuth = {
      'clientID'      : '902102522477336',     // 你的 Facebook App ID
      'clientSecret'  : '267a3fdc14c82f38f5b45ed333cc95ef',     // 你的 Facebook App Secret
      'callbackURL'   : 'https://re01.onrender.com/auth/facebook/callback'  // 登录成功后 Facebook 回调的地址
};

// 用于临时存放登录后的用户信息（实际项目中通常存数据库，这里简化用对象）
var user = {};  

// ==================== Passport 序列化/反序列化用户 ====================
// Passport 需要将用户对象“压扁”存进 session，再从 session 取出来恢复
passport.serializeUser(function (user, done) {
    // 把整个 user 对象存进 session（这里直接存对象，实际可用 user.id 更安全）
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    // 从 session 中取回时，直接把之前存的 user 对象返回
    done(null, user);
});

// ==================== 配置 Facebook 登录策略 ====================
passport.use(new FacebookStrategy({
    clientID     : facebookAuth.clientID,         // App ID
    clientSecret : facebookAuth.clientSecret,     // App Secret
    callbackURL  : facebookAuth.callbackURL,      // 回调地址
    profileFields: ['id', 'displayName', 'emails'] // 可选：明确要求返回的字段（旧版本需要）
  },
  function (accessToken, refreshToken, profile, done) {
    // 此回调函数在 Facebook 验证成功后执行
    console.log("Facebook 返回的用户资料：");
    console.log(profile);     // profile 包含 Facebook 返回的所有用户信息

    // 组装我们自己的 user 对象（后面会存进 session）
    user = {};                                 // 清空旧数据
    user['id']   = profile.id;                 // Facebook 用户唯一 ID
    user['name'] = profile.displayName;        // 显示名称（如：张三）
    user['type'] = profile.provider;           // 登录方式："facebook"

    console.log('整理后要存入 session 的 user 对象：', JSON.stringify(user));

    // 重要：调用 done() 把用户交给 Passport，Passport 会自动调用 serializeUser 存入 session
    return done(null, user);   // 第一个参数 err，null 表示成功
  })
);

// 设置视图引擎为 ejs（后面 /content 路由会渲染模板）
app.set('view engine', 'ejs');

// ==================== Session 和 Passport 初始化（顺序很重要！）================
// 必须先 use session，再 use passport
app.use(session({
    secret: "tHiSiSasEcRetStr",   // 用于加密 session 的密钥，随便写但要保密
    resave: true,                 // 每次请求都重新保存 session
    saveUninitialized: true      // 保存未初始化的 session
}));

app.use(passport.initialize());       // 初始化 Passport
app.use(passport.session());          // 让 Passport 使用 session 来保持登录状态

// ==================== 中间件：判断用户是否已登录 ====================
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {      // Passport 提供的方法，检查是否已登录
        return next();                // 已登录 → 继续执行后面的路由处理函数
    }
    res.redirect('/login');           // 未登录 → 跳转到登录页面
}

// ==================== 路由定义 ====================

// 首页 - 必须登录才能访问
app.get("/", isLoggedIn, function (req, res) {
    res.send('Hello, ' + req.user.name + '！');  // req.user 是 Passport 自动挂上的已登录用户信息
});

// 登录页面 - 显示 Facebook 登录按钮
app.get("/login", function (req, res) {
    res.send("<a href='/auth/facebook'>使用 Facebook 登录</a>");
});

// 1. 点击登录 → 跳转到 Facebook 授权页面
app.get("/auth/facebook", 
    passport.authenticate("facebook", { scope: "email" })   // scope 可要求邮箱等权限
);

// 2. Facebook 授权后回调此地址
app.get("/auth/facebook/callback",
    passport.authenticate("facebook", {
        successRedirect: "/content",   // 登录成功跳转到内容页
        failureRedirect: "/"           // 登录失败跳转到首页
    })
);

// 内容页面 - 需要登录，使用 ejs 模板渲染
app.get("/content", isLoggedIn, function (req, res) {
    // 渲染 views/frontpage.ejs 模板，并把用户信息传进去
    res.render('frontpage', { user: req.user });
});

// 退出登录
app.get("/logout", function(req, res, next) {
    // Passport 提供的 logout 方法（新版本需传回调）
    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');   // 退出后跳转到首页
    });
});

// ==================== 启动服务器 ====================
app.listen(process.env.PORT || 8099, function() {
    console.log("服务器已启动，访问 http://localhost:8099");
});
