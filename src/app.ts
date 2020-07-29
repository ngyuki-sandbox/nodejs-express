import express from 'express'
import path from 'path'
import logger from 'morgan'
import Debug from 'debug'
import errorhandler from 'errorhandler'
import expressLayouts from 'express-ejs-layouts'
import createError from 'http-errors'
import 'express-async-errors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import flash from 'express-flash'
import csrf from 'csurf'

import { routes } from './routes'

const debug = Debug('app:debug')
debug('app starting');

const app = express()

app.set('views', path.resolve(__dirname, '../views'));
app.set('view engine', 'ejs');

// セキュリティ関係のヘッダを追加
app.use(helmet({ contentSecurityPolicy: false }));

// X-Forwarded-* ヘッダーを見る
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

// アクセスログを記録
app.use(logger('dev'));

// application/json 形式のリクエストを解析
app.use(express.json());

// application/x-www-form-urlencoded 形式のリクエストを解析
app.use(express.urlencoded({extended: true}));

// Cookie 解析
app.use(cookieParser());

// セッション
app.use(session({
    name: 'my-express-app',
    secret: 'my-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
}));

// フラッシュメッセージ
app.use(flash());

// CSRF
app.use(csrf());

// public/ のファイルを静的ファイルとして返す
app.use(express.static(path.resolve(__dirname, '../public')));

// レウアウトを有効化
app.use(expressLayouts);

// ルート定義
app.use(routes);

// 最終ミドルウェアとして 404 を返す
// なくても 404 変えるので不要な気もする
app.use(function(req, res, next) {
    next(createError(404));
});

// エラーハンドラ
// 開発時は errorhandler パッケージを html/json などに応じたレスポンスを返してくれる
// ただし errorhandler は NODE_ENV が production でもスタックトレースがそのまま出る
// デフォルトのエラーハンドラは NODE_ENV で応答を変えてくれるのでどっちもどっち？
app.use(errorhandler());

const port = parseInt(process.env.PORT || '9876');
app.listen(port, () => {
    console.log(`Listening on :${port}`);
});

