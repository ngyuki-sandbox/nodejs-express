import { Router } from 'express'

import { routes as home } from './home'

export const routes = Router();

routes.get('/', (req, res, next) => {
    if (req.session!.views) {
        req.session!.views++;
    } else {
        req.session!.views = 1;
    }
    res.send(`hello workd. ${req.session!.views} views.`);
});

// ルートパラメータの例
routes.get('/hello/:name', (req, res, next) => {
    res.json({
        hello: req.params.name
    });
});

routes.get('/error', (req, res, next) => {
    throw new Error('oops!!');
});

// 非同期例外
// express-async-errors パッケージをインポートしておけば投げっぱなしでも大丈夫
routes.get('/async-error', async (req, res, next) => {
    await new Promise(r => setTimeout(r, 1));
    throw new Error('async oops!!!');
});

// 別パッケージで定義したサブルートを登録
routes.use('/home', home);
