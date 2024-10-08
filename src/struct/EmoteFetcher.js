const BTTVEmote = require("./BTTVEmote");
const Channel = require("./Channel");
const Collection = require("../util/Collection");
const Constants = require("../util/Constants");
const FFZEmote = require("./FFZEmote");
const SevenTVEmote = require("./SevenTVEmote");
const TwitchEmote = require("./TwitchEmote");

const axios = require("axios");
const { ApiClient } = require("@twurple/api");
const { AppTokenAuthProvider } = require("@twurple/auth");

class EmoteFetcher {
  /**
   * Fetches and caches emotes.
   * @param {string} clientId The client id for the twitch api.
   * @param {string} clientSecret The client secret for the twitch api.
   * @param {object} options Additional options.
   * @param {ApiClient} options.apiClient - Bring your own Twurple ApiClient.
   */
  constructor(clientId, clientSecret, options) {
    if (options && options.apiClient) {
      this.apiClient = options.apiClient;
    } else if (clientId !== undefined && clientSecret !== undefined) {
      const authProvider = new AppTokenAuthProvider(clientId, clientSecret);

      /**
       * Twitch api client.
       */
      this.apiClient = new ApiClient({ authProvider });
    }

    /**
     * Cached emotes.
     * Collectionped by emote code to Emote instance.
     * @type {Collection<string, Emote>}
     */
    this.emotes = new Collection();

    /**
     * Cached channels.
     * Collectionped by name to Channel instance.
     * @type {Collection<string, Channel>}
     */
    this.channels = new Collection();

    /**
     * Save if we fetched FFZ's modifier emotes once.
     * @type {boolean}
     */
    this.ffzModifiersFetched = false;
  }

  /**
   * The global channel for Twitch, BTTV and 7TV.
   * @readonly
   * @type {?Channel}
   */
  get globalChannel() {
    return this.channels.get(null);
  }

  /**
   * Sets up a channel
   * @private
   * @param {int} channel_id - ID of the channel.
   * @param {string} [format=null] - The type file format to use (webp/avif).
   * @returns {Channel}
   */
  _setupChannel(channel_id, format = null) {
    let channel = this.channels.get(channel_id);
    if (!channel) {
      channel = new Channel(this, channel_id);
      this.channels.set(channel_id, channel);
    }
    if (format) channel.format = format;
    return channel;
  }

  /**
   * Gets the raw Twitch emotes data for a channel.
   * @private
   * @param {int} id - ID of the channel.
   * @returns {Promise<object[]|null>}
   */
  async _getRawTwitchEmotes(id) {
    if (!this.apiClient) {
      throw new Error("Client id or client secret not provided.");
    }

    let emotes;
    if (id) {
      emotes = await this.apiClient.chat.getChannelEmotes(id);
    } else {
      emotes = await this.apiClient.chat.getGlobalEmotes();
    }

    return emotes.length > 0 ? emotes : null;
  }

  /**
   * Gets the raw BTTV emotes data for a channel.
   * Use `null` for the global emotes channel.
   * @private
   * @param {int} [id=null] - ID of the channel.
   * @returns {Promise<object[]|null>}
   */
  async _getRawBTTVEmotes(id) {
    const endpoint = !id ? Constants.BTTV.Global : Constants.BTTV.Channel(id);

    try {
      const response = await axios.get(endpoint);

      if (response.status !== 200) return null;

      let emotes = [];

      if (Array.isArray(response.data)) {
        // If the response data is an array, it indicates global emotes
        emotes = response.data; // This is the case for global emotes
      } else {
        // If response data is an object, check for channel-specific emotes
        if (
          response.data.channelEmotes &&
          Array.isArray(response.data.channelEmotes)
        ) {
          emotes.push(...response.data.channelEmotes); // Add channel emotes if they exist
        }
        if (
          response.data.sharedEmotes &&
          Array.isArray(response.data.sharedEmotes)
        ) {
          emotes.push(...response.data.sharedEmotes); // Add shared emotes if they exist
        }
      }

      return emotes.length > 0 ? emotes : null; // Return emotes if any are found
    } catch (error) {
      // Error fetching BTTV emotes
      return null;
    }
  }

  /**
   * Gets the raw FFZ emotes data for a channel.
   * @private
   * @param {int} id - ID of the channel.
   * @returns {Promise<object[]|null>}
   */
  async _getRawFFZEmotes(id) {
    const endpoint = !id ? Constants.FFZ.Global : Constants.FFZ.Channel(id);

    try {
      const response = await axios.get(endpoint);

      if (response.status !== 200) return null;

      const emotes = [];
      const modifiers = [];

      // Loop through the emote sets and collect emotes and modifiers separately
      for (const key of Object.keys(response.data.sets)) {
        const set = response.data.sets[key];
        for (const emote of set.emoticons) {
          if (emote.modifier) {
            modifiers.push(emote); // Add modifier emotes to a separate array
          } else {
            emotes.push(emote); // Regular emotes
          }
        }
      }

      return { emotes, modifiers };
    } catch (error) {
      // Error fetching FFZ emotes
      return null;
    }
  }

  /**
   * Gets the raw 7TV emotes data for a channel.
   * @private
   * @param {int} [id=null] - ID of the channel.
   * @returns {Promise<object[]|null>}
   */
  async _getRawSevenTVEmotes(id) {
    const endpoint = !id
      ? Constants.SevenTV.Global
      : Constants.SevenTV.Channel(id);

    try {
      const response = await axios.get(endpoint);

      if (response.status !== 200) return null;

      if ("emotes" in response.data) {
        // From an emote set (like "global")
        return response.data.emotes.length > 0 ? response.data.emotes : null;
      } else {
        // From users
        return response.data.emote_set &&
          response.data.emote_set.emotes.length > 0
          ? response.data.emote_set.emotes
          : null;
      }
    } catch (error) {
      // Error fetching SevenTV emotes
      return null;
    }
  }

  /**
   * Fetches the Twitch emotes for a channel.
   * Use `null` for the global emotes channel.
   * @param {int} [channel=null] - ID of the channel.
   * @returns {Promise<Collection<string, TwitchEmote>|null>}
   */
  async fetchTwitchEmotes(channel = null) {
    const rawEmotes = await this._getRawTwitchEmotes(channel);
    if (!rawEmotes) return null;

    const channelEmotes = new Collection();
    for (const emote of rawEmotes) {
      const cachedEmote = this._cacheTwitchEmote(channel, {
        code: emote.name,
        id: emote.id,
        formats: emote.formats,
      });
      channelEmotes.set(cachedEmote.code, cachedEmote);
    }

    return channelEmotes;
  }

  /**
   * Fetches the BTTV emotes for a channel.
   * Use `null` for the global emotes channel.
   * @param {int} [channel=null] - ID of the channel.
   * @returns {Promise<Collection<string, BTTVEmote>|null>}
   */
  async fetchBTTVEmotes(channel = null) {
    const rawEmotes = await this._getRawBTTVEmotes(channel);
    if (!rawEmotes) return null;

    const channelEmotes = new Collection();
    for (const data of rawEmotes) {
      const cachedEmote = this._cacheBTTVEmote(channel, data);
      channelEmotes.set(cachedEmote.code, cachedEmote);
    }

    return channelEmotes;
  }

  /**
   * Fetches the FFZ emotes for a channel.
   * @param {int} [channel=null] - ID of the channel.
   * @returns {Promise<Collection<string, FFZEmote>|null>}
   */
  async fetchFFZEmotes(channel = null) {
    let rawEmotes;

    if (!channel) {
      rawEmotes = await this._getRawFFZEmotes();
    } else {
      rawEmotes = await this._getRawFFZEmotes(channel);
    }

    if (!rawEmotes) return null;

    const { emotes, modifiers } = rawEmotes;

    const channelEmotes = new Collection();
    for (const data of emotes) {
      const cachedEmote = this._cacheFFZEmote(channel, data);
      channelEmotes.set(cachedEmote.code, cachedEmote);
    }

    // If you want to handle modifiers:
    if (modifiers.length > 0) {
      for (const modifier of modifiers) {
        this._cacheFFZEmote(channel, modifier); // Cache modifier emotes as well
      }
    }

    return channelEmotes;
  }

  /**
   * Fetches the 7TV emotes for a channel.
   * @param {int} [channel=null] - ID of the channel.
   * @param {('webp'|'avif')} [format='webp'] - The type file format to use (webp/avif).
   * @returns {Promise<Collection<string, SevenTVEmote>|null>}
   */
  async fetchSevenTVEmotes(channel = null, format = "webp") {
    const rawEmotes = await this._getRawSevenTVEmotes(channel);
    if (!rawEmotes) return null;

    const channelEmotes = new Collection();

    for (const data of rawEmotes) {
      // Sometimes they don't have matching names, we trust data.name more
      data.data.name = data.name;
      const cachedEmote = this._cacheSevenTVEmote(channel, data.data, format);
      channelEmotes.set(cachedEmote.code, cachedEmote);
    }

    return channelEmotes;
  }

  // Update caching methods to return the created emote
  _cacheTwitchEmote(channel_id, data, existing_emote = null) {
    const channel = this._setupChannel(channel_id);
    const emote = existing_emote || new TwitchEmote(channel, data.id, data);
    this.emotes.set(emote.code, emote);
    channel.emotes.set(emote.code, emote);
    return emote;
  }

  _cacheBTTVEmote(channel_id, data, existing_emote = null) {
    const channel = this._setupChannel(channel_id);
    const emote = existing_emote || new BTTVEmote(channel, data.id, data);
    this.emotes.set(emote.code, emote);
    channel.emotes.set(emote.code, emote);
    return emote;
  }

  _cacheFFZEmote(channel_id, data, existing_emote = null) {
    const channel = this._setupChannel(channel_id);
    const emote = existing_emote || new FFZEmote(channel, data.id, data);
    this.emotes.set(emote.code, emote);
    channel.emotes.set(emote.code, emote);
    return emote;
  }

  _cacheSevenTVEmote(channel_id, data, format, existing_emote = null) {
    const channel = this._setupChannel(channel_id, format);
    const emote = existing_emote || new SevenTVEmote(channel, data.id, data);
    this.emotes.set(emote.code, emote);
    channel.emotes.set(emote.code, emote);
    return emote;
  }

  /**
   * Converts emote Objects to emotes
   * @param {object} [emotesArray] - An array of emote objects
   * @returns {Emote[]}
   */
  fromObject(emotesArray) {
    const emotes = [];
    const classMap = {
      bttv: {
        class: BTTVEmote,
        cache: (emoteObject, channel_id, existing_emote) =>
          this._cacheBTTVEmote(channel_id, null, existing_emote),
      },
      ffz: {
        class: FFZEmote,
        cache: (emoteObject, channel_id, existing_emote) =>
          this._cacheFFZEmote(channel_id, null, existing_emote),
      },
      "7tv": {
        class: SevenTVEmote,
        cache: (emoteObject, channel_id, existing_emote) =>
          this._cacheSevenTVEmote(
            channel_id,
            null,
            emoteObject.imageType,
            existing_emote
          ),
      },
      twitch: {
        class: TwitchEmote,
        cache: (emoteObject, channel_id, existing_emote) =>
          this._cacheTwitchEmote(channel_id, null, existing_emote),
      },
    };
    for (const emoteObject of emotesArray) {
      const { type } = emoteObject;
      if (!Object.keys(classMap).includes(type)) {
        throw new TypeError(`Unknown type: ${type}`);
      }

      const emoteClass = classMap[type].class;
      this._setupChannel(
        emoteObject.channel_id,
        type === "7tv" ? emoteObject.imageType : null
      );
      const emote = emoteClass.fromObject(
        emoteObject,
        this.channels.get(emoteObject.channel_id)
      );
      classMap[type].cache(emoteObject, emoteObject.channel_id, emote);
      emotes.push(emote);
    }
    return emotes;
  }
}

module.exports = EmoteFetcher;
