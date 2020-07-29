import { Router } from 'express'
import { PostRepository } from '../repository/post'

export const routes = Router();

routes.get('/', async (req, res, next) => {
    const flash = req.flash();

    const message = flash['message'] && flash['message'].length
        ? flash['message'][0] : null;

    const postRepo = new PostRepository();
    const posts = (await postRepo.load()).reverse();

    const name = req.cookies.name || '';

    const csrfToken = req.csrfToken();

    res.render('home', { name, message, posts, csrfToken });
});

routes.post('/', async (req, res, next) => {
    const post = {
        name: req.body.name,
        text: req.body.text,
    };

    res.cookie('name', post.name, {
        path: '/',
        httpOnly: true,
        maxAge: 3600000,
    });

    const postRepo = new PostRepository();
    await postRepo.save(post);

    req.flash('input', JSON.stringify(req.body));
    req.flash('message', 'done!');
    res.redirect(req.originalUrl);
});
