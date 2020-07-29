import { promises as fs } from 'fs';
import path from 'path';
import { config } from '../config';

export type Post = {
    name: string,
    text: string,
};

export class PostRepository {

    private readonly dataFile: string;

    public constructor() {
        this.dataFile = path.join(config.dataPath, 'data.json');
    }

    public async load(): Promise<Post[]> {
        try {
            await fs.stat(this.dataFile);
        } catch (err) {
            return [];
        }
        const json = await fs.readFile(this.dataFile, { encoding: 'utf8'});
        const data = JSON.parse(json) as Post[];
        return data;
    }

    public async save(post: Post) {
        const data = await this.load();
        data.push(post);
        const newData = data.slice(-10);
        fs.writeFile(this.dataFile, JSON.stringify(newData));
    }
}
