# [Express][TypeScript]Express を TypeScript で使ってみたメモ

TypeScript でなにか書いてみたかったのでいちばん有名そうなバックエンドのフレームワークの [Express](https://expressjs.com/) を使ってみたメモ。`@types` がしっかりメンテされているので `@types/express` とかを入れておけばあまり困ることはなさそうでした。

以下は所感とかのまとまりのない雑文です。普段 Web のバックエンドは PHP でしか書かないので、同じ「ミドルウェア」でも結構取り回しが違っていて戸惑いました。

## ミドルウェアとエラーハンドラ

ミドルウェアとエラーハンドラはどちらも同じ `app.use` で登録します。コールバック関数の引数の数でどちらなのか区別されます。

```ts
app.use((req, res, next) => {
    // ミドルウェア
})

app.use((err, req, res, next) => {
    // エラーハンドラ
})
```

なので、エラーハンドラは `err` しか要らない場合でも必ず 4 引数持つ必要があります。

ミドルウェアかエラーハンドラは下記のあたりで区別されています。

- https://github.com/expressjs/express/blob/5596222f6a6e0eea74f6fb38915b071d98122a2f/lib/router/layer.js#L89
- https://github.com/expressjs/express/blob/5596222f6a6e0eea74f6fb38915b071d98122a2f/lib/router/layer.js#L65

ミドルウェアで発生した例外は直後にキャッチされて `next()` の引数で渡されます。

- https://github.com/expressjs/express/blob/5596222f6a6e0eea74f6fb38915b071d98122a2f/lib/router/layer.js#L94-L98

呼び分けはこのあたり。

- https://github.com/expressjs/express/blob/3ed5090ca91f6a387e66370d57ead94d886275e1/lib/router/route.js#L134-L138

ミドルウェアとエラーハンドラは同じパイプラインで実行されます。前段のミドルウェアで `next()` の引数に何が渡されたかによって次のミドルウェアをスキップするかどうかが決定されます。

例えば次の場合、B のミドルウェアで発生した例外は C のエラーハンドラで拾われた後 D のミドルウェアが実行されます。

```ts
// B で例外が発生した時点で既にスキップされているので実行されない
app.use((err, req, res, next) => {
    console.log('A');
    next();
});

// ここで例外が発生 → 自動的に next(err) が呼ばれる
app.use((req, res, next) => {
    console.log('B');
    throw new Error('oops!!');
});

// 前段で例外が発生しているので実行される
app.use((err, req, res, next) => {
    console.log('C');
    next();
});

// 前段で next() が呼ばれているので実行される
app.use((req, res, next) => {
    console.log('D');
    next();
});

// 前段で next() が呼ばれているので実行される
app.use((err, req, res, next) => {
    console.log('E');
    next();
});
```

A と E は実行されません。A のエラーハンドラは B まで処理が来た時点でスキップされています。E のエラーハンドラは D で `next()` の引数が空なのでスキップされます。

大抵の PHP のフレームワークだと、ミドルウェアで例外が発生したときは最上位のエラーハンドラミドルウェアとかがキャッチして、通常のパイプラインとは別のエラーハンドラ用のパイプラインにディスパッチ、みたいな実装になっていると思います（と思ってたけどそうでもないらしい）。なのでこの実装には戸惑いました。

とりあえずエラーハンドラはミドルウェアスタックの最下段に 1 つだけ入れるか、複数入れる場合は後段のエラーハンドラを呼ぶために、前段のエラーハンドラで `next()` に `err` を渡すのを忘れないように注意が必要そうです。

## 非同期エラー

Express 4 では、ハンドラを `async` にして例外を投げると Express によって補足されることなくプロセスが死にます。ので、次のように例外をキャッチして `next()` に渡す必要があります。

```ts
app.get('/async-error', async (req, res, next) => {
    try {
        await new Promise(r => setTimeout(r, 1));
        throw new Error('async oops!!!');
    } catch (err) {
        next(err);
    }
});
```

もしくは `async` が返す `Promise` の `catch` でも良いです。

```ts
app.get('/async-error', (req, res, next) => {
    (async () => {
        await new Promise(r => setTimeout(r, 1));
        throw new Error('async oops!!!');
    })().catch(next);
});
```

このラップを簡単にできるようなヘルパーを用意すると良いかも。

```ts
function asyncHandler<T extends RequestHandler>(handler: T): (... args: Parameters<RequestHandler>) => void {
    const newHandler: (... args: Parameters<RequestHandler>) => void = (req, res, next) => {
        const ret = handler(req, res, next);
        if (ret instanceof Promise) {
            ret.catch(next);
        }
    }
    return newHandler;
}

app.get('/async-error', asyncHandler(async (req, res, next) => {
    await new Promise(r => setTimeout(r, 1));
    throw new Error('async oops!!!');
}));
```

と思ったら [express-async-errors](https://www.npmjs.com/package/express-async-errors) パッケージをインポートするだけでも大丈夫でした。

```ts
import 'express-async-errors'

app.get('/async-error', async (req, res, next) => {
    await new Promise(r => setTimeout(r, 1));
    throw new Error('async oops!!!');
});
```

このパッケージが Express へのパッチで似たようにラップしてくれるので、非同期例外も投げっぱなしで大丈夫です。

## ミドルウェアの後処理でヘッダーを追加する

例えば次のコードでは `/` のルートハンドラによってヘッダーが送信済になっているので、ミドルウェアで `next()` の後でヘッダーを追加出来ません。

```ts
app.use((req, res, next) => {
    next();
    // ↓のハンドラでヘッダーが送信済なのでここではヘッダーを設定できない
    res.setHeader('X-fuga', res.getHeader('X-hoge') || '');
});

app.get('/', (req, res, next) => {
    res.setHeader('X-hoge', '123');
    res.json({'hoge': 123});
    next();
});
```

[on-headers](https://www.npmjs.com/package/on-headers) パッケージを次のように使うと良いようです。

```ts
import onHeaders from 'on-headers'

app.use((req, res, next) => {
    onHeaders(res, ()=>{
        res.setHeader('X-fuga', res.getHeader('X-hoge') || '');
    });
    next();
});

app.get('', (req, res, next) => {
    res.setHeader('X-hoge', '123');
    res.json({'hoge': 123});
    next();
});
```

そもそも非同期ハンドラが存在する可能性を考えると `next()` の後でなにかするのは意味がありませんね。`async next()` みたいにできれば良さそうですけど・・と思ったら [Koa](https://koajs.com/) はそうなんですね、こっちのが良さそう・・Express 5 だとこの辺りも改善されているのでしょうか。されてなさそう。

また、レスポンスボディも `res.json({'hoge': 123})` とかの時点でクライアントに送られてしまいます。なのでたとえ非同期ハンドラがなかったとしてもミドルウェアで `next()` の後でレスポンスを改変することはできないようです。

あるいは次のようにレスポンスオブジェクトのメソッドをガッと書き換えて無理やりバッファリングする必要があるようです。

- https://github.com/expressjs/compression/blob/3fea81d0eaed1eb872bf3e0405f20d9e175ab2cf/index.js#L78

## Request の拡張

`express-session` や `express-flash` や `csurf` などのミドルウェアは Request オブジェクトにプロパティやメソッドを生やします。

例えば `express-session` であれば次のように `req.session` でセッションにアクセスできます。

```ts
app.get('/', (req, res, next) => {
    if (req.session.views) {
        req.session.views++
    } else {
        req.session.views = 1
    }
})
```

`req.session` は Express 本体の型定義 `@types/express` ではなく、このミドルウェアの型定義 `@types/express-session` で本体の型を拡張しています。`req.session` はセッションのミドルウェアを通った後しか存在しないので型定義では `session?: Session` となっています。ので、上のコードそのままでは型チェックに通りません。次のように ts の型システムを黙らせる必要があります。

```ts
routes.get('/', (req, res, next) => {
    if (req.session!.views) {
        req.session!.views++;
    } else {
        req.session!.views = 1;
    }
});
```

より型安全にするなら次のようになるでしょうか。でもこれ、最初の `if` の中は決して実行されません。

```ts
routes.get('/', (req, res, next) => {
    if (req.session == null) {
        return next(createHttpError(500));
    }
    if (req.session.views) {
        req.session.views++;
    } else {
        req.session.views = 1;
    }
});
```

なお `express-flash` や `csurf` では型定義ファイルで `?` 無しで定義されています。なので `!` で型システムを黙らせる必要はありません。もちろんミドルウェアが有効になっていないルートで使えば `TypeError: req.flash is not a function` です。

ところでアプリケーション固有のミドルウェアでリクエストオブジェクトを拡張したいときはどうするものなのでしょうか。[Crowi](https://github.com/crowi/crowi) のコードを覗いてみたところ次のように拡張されていました。

- [crowi/express\-serve\-static\-core\.d\.ts at master · crowi/crowi](https://github.com/crowi/crowi/blob/49e21c99b6e66775b16b2d98f3043bed86f1a438/lib/types/express-serve-static-core.d.ts#L6-L17)

アプリケーション固有のミドルウェアでもリクエストオブジェクトを拡張するなら、同じように型定義ファイルを書くのが良さそうです。

## debug

デバッグログの出力には [debug](https://www.npmjs.com/package/debug) パッケージを使うと良いようです。

```ts
import Debug from 'debug'

const debug = Debug('app:debug');
debug('app starting');
```

通常はこのログは出力されず、環境変数 `DEBUG` で出力するかどうかを制御できます。

```sh
env DEBUG=app.\* ts-node -T app.ts
```

Express 本体が debug パッケージでデバッグログを出力しているので次のようにすれば Express コアのログも出力できます。

```sh
env DEBUG=express:\* ts-node -T app.ts
```

単にログレベル的なものを指定するのではなくファシリティ的なものを指定できるのは良いですね（といっても大概は `DEBUG=\*` とかにしちゃうかも）。

## NODE_ENV

NodeJS のアプリでは `NODE_ENV` 環境変数で `development` とか `production` とかを指定するのが主流なようです。

また、アプリケーションで `NODE_ENV` を使わなかったとしても、Express 本体や Express が依存するパッケージが `NODE_ENV` で動作を変えることがあります。

- https://github.com/expressjs/express/blob/3ed5090ca91f6a387e66370d57ead94d886275e1/lib/application.js#L118
- https://github.com/pillarjs/finalhandler/blob/15e78cab32ecbd4993d1575a065963b238336df9/index.js#L174

ので、アプリで使わないにしても `NODE_ENV` は必ず指定しておいたほうが良さそうです。

## さいごに

NodeJS というか TypeScript でなにか書いてみたくて、とりあえず Express が一番有名っぽいので使ってみたのですが、非同期ハンドラの対応が弱く、後発の Koa とかのが良さそうにも感じました。
