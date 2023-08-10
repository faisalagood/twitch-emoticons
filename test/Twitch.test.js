const { describe, expect, test } = require('@jest/globals');
const { env } = require('process');
const { EmoteFetcher, EmoteParser, Collection } = require('../src/index.js');

describe('Test Twitch emotes', () => {
    test('Test failing when environment variables are not set', () => {
        const emoteFetcher = new EmoteFetcher();

        expect(() => {
            emoteFetcher.fetchTwitchEmotes();
        }).toThrow(
            new Error('Client id or client secret not provided.')
        );
    });

    if (env.TWITCH_ID === undefined || env.TWITCH_SECRET === undefined
      || env.TWITCH_ID === '' || env.TWITCH_SECRET === '') {
        test.todo('Notice: Twitch client id/secret missing, not testing fetching and parsing.');
    } else {
        describe('Test global emotes', () => {
            const emoteFetcher = new EmoteFetcher(env.TWITCH_ID, env.TWITCH_SECRET);
            const emoteParser = new EmoteParser(emoteFetcher, {
                type: 'markdown',
                match: /:(.+?):/g
            });

            test('Execute fetchTwitchEmotes without any parameters', async() => {
                expect(await emoteFetcher.fetchTwitchEmotes()).toBeInstanceOf(Collection);
            });

            test('Get emote (Kappa)', () => {
                const emote = emoteFetcher.emotes.get('Kappa');
                expect(emote.toLink(2)).toBe('https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0');
            });

            test('Parse string with emote (CoolCat)', () => {
                const text = emoteParser.parse('This is a test string with :CoolCat: in it.');
                expect(text).toBe('This is a test string with ![CoolCat](https://static-cdn.jtvnw.net/emoticons/v2/58127/default/dark/1.0 "CoolCat") in it.');
            });
        });

        describe('Test user emotes', () => {
            const emoteFetcher = new EmoteFetcher(env.TWITCH_ID, env.TWITCH_SECRET);
            const emoteParser = new EmoteParser(emoteFetcher, {
                type: 'markdown',
                match: /:(.+?):/g
            });

            test('Execute fetchTwitchEmotes with user ID', async() => {
                expect(await emoteFetcher.fetchTwitchEmotes(56648155)).toBeInstanceOf(Collection);
            });

            test('Get emote (tppD)', () => {
                const emote = emoteFetcher.emotes.get('tppD');
                expect(emote.toLink(2)).toBe('https://static-cdn.jtvnw.net/emoticons/v2/307609315/default/dark/3.0');
            });

            test('Parse string with emote (tppD)', () => {
                const text = emoteParser.parse('This is a test string with :tppD: in it.');
                expect(text).toBe('This is a test string with ![tppD](https://static-cdn.jtvnw.net/emoticons/v2/307609315/default/dark/1.0 "tppD") in it.');
            });
        });
    }
});
