/**
 * ============================================================================
 * SAMPLE DATA SECTION (READING TEXT, ANKI WORD CARDS & SOUNDS MAP)
 * Easily replaceable with other stories or vocabulary decks.
 * ============================================================================
 */

export interface SentenceItem {
  id: string;
  en: string;
  tr: string;
}

export interface ReadingArticle {
  id: string;
  title: string;
  level: string;
  paragraphs: SentenceItem[][];
}

export interface WordCard {
  id: string;
  headword: string;
  surfaceForms: string[];
  front: string;
  back: string;
  hint?: string;
}

export interface SoundEntry {
  file?: string;
  text: string;
}

/**
 * 1. Reading Screen Data: "Eski Bahçe" (B1 Level)
 * Array of paragraphs, each an array of {en, tr} sentences.
 */
export const SAMPLE_ARTICLE: ReadingArticle = {
  id: 'article-eski-bahce',
  title: 'Eski Bahçe',
  level: 'B1',
  paragraphs: [
    // Paragraph 1
    [
      {
        id: 's-1',
        en: 'The old garden was quiet in the morning.',
        tr: 'Eski bahçe sabah sessizdi.',
      },
      {
        id: 's-2',
        en: 'White daisies grew along the path.',
        tr: 'Yol boyunca beyaz papatyalar büyüyordu.',
      },
      {
        id: 's-3',
        en: 'Thick ivy covered the stone wall.',
        tr: 'Kalın sarmaşık taş duvarı kaplıyordu.',
      },
      {
        id: 's-4',
        en: 'A small fox ran into the undergrowth.',
        tr: 'Küçük bir tilki çalılığın içine koştu.',
      },
      {
        id: 's-5',
        en: 'I stopped for a moment and breathed in the cool air.',
        tr: 'Bir an durdum ve serin havayı içime çektim.',
      },
      {
        id: 's-6',
        en: 'It was the perfect place to relax.',
        tr: 'Rahatlamak için mükemmel bir yerdi.',
      },
    ],
    // Paragraph 2
    [
      {
        id: 's-7',
        en: 'Under the big oak tree, I found a few acorns on the ground.',
        tr: 'Büyük meşe ağacının altında yerde birkaç palamut buldum.',
      },
      {
        id: 's-8',
        en: 'Some of them were still green, and others were already brown.',
        tr: 'Bazıları hâlâ yeşildi, bazıları ise çoktan kahverengiydi.',
      },
      {
        id: 's-9',
        en: 'A squirrel was watching me from a high branch.',
        tr: 'Bir sincap yüksek bir daldan beni izliyordu.',
      },
      {
        id: 's-10',
        en: 'I put one acorn in my pocket and kept walking.',
        tr: 'Bir palamudu cebime koydum ve yürümeye devam ettim.',
      },
      {
        id: 's-11',
        en: 'Behind the tree, a field of yellow dandelions was shining in the sun.',
        tr: 'Ağacın arkasında sarı karahindibalarla dolu bir tarla güneşte parlıyordu.',
      },
      {
        id: 's-12',
        en: 'When the wind blew, the white seeds flew into the sky.',
        tr: 'Rüzgâr esince beyaz tohumlar gökyüzüne uçtu.',
      },
    ],
    // Paragraph 3
    [
      {
        id: 's-13',
        en: 'My grandmother used to tell me stories about this garden.',
        tr: 'Büyükannem bana bu bahçeyle ilgili hikâyeler anlatırdı.',
      },
      {
        id: 's-14',
        en: 'She said the old maple tree gave sweet sap in spring.',
        tr: 'Eski akçaağacın baharda tatlı bir bitki özü verdiğini söylerdi.',
      },
      {
        id: 's-15',
        en: 'In addition to the flowers, she grew basil and mint near the kitchen door.',
        tr: 'Çiçeklere ek olarak mutfak kapısının yanında fesleğen ve nane yetiştirirdi.',
      },
      {
        id: 's-16',
        en: 'The addition of a small pond made the garden even more beautiful.',
        tr: 'Küçük bir göletin eklenmesi bahçeyi daha da güzelleştirdi.',
      },
      {
        id: 's-17',
        en: 'Every summer, we sat under the ivy and drank cold lemonade.',
        tr: 'Her yaz sarmaşığın altında oturup soğuk limonata içerdik.',
      },
    ],
    // Paragraph 4
    [
      {
        id: 's-18',
        en: 'Today, the garden is not as neat as it was then.',
        tr: 'Bugün bahçe o zamanki kadar düzenli değil.',
      },
      {
        id: 's-19',
        en: 'Tall grass and wild undergrowth have taken over the corners.',
        tr: 'Uzun otlar ve vahşi çalılıklar köşeleri ele geçirmiş.',
      },
      {
        id: 's-20',
        en: 'Still, the daisies come back every year.',
        tr: 'Yine de papatyalar her yıl geri geliyor.',
      },
      {
        id: 's-21',
        en: 'I knelt down and touched the sticky sap on the bark of the tree.',
        tr: 'Diz çöküp ağacın kabuğundaki yapışkan bitki özüne dokundum.',
      },
      {
        id: 's-22',
        en: 'It smelled like rain and old wood.',
        tr: 'Yağmur ve eski odun gibi kokuyordu.',
      },
      {
        id: 's-23',
        en: 'Before leaving, I breathed deeply one more time.',
        tr: 'Ayrılmadan önce bir kez daha derin nefes aldım.',
      },
      {
        id: 's-24',
        en: 'Then I planted the acorn near the wall, hoping it would grow into a tree one day.',
        tr: 'Sonra palamudu duvarın yanına diktim, bir gün ağaç olarak büyümesini umarak.',
      },
      {
        id: 's-25',
        en: 'Some places stay with you, even when you leave them.',
        tr: 'Bazı yerler, onları terk etsen bile seninle kalır.',
      },
    ],
    // Paragraph 5 (phrase test sentences: trailing punctuation, optional words, irregular verbs)
    [
      {
        id: 's-26',
        en: 'According to the weather forecast, it was going to rain in the afternoon.',
        tr: 'Hava durumuna göre öğleden sonra yağmur yağacaktı.',
      },
      {
        id: 's-27',
        en: 'My brother came into the garden and said he wanted to cut the old oak tree down.',
        tr: 'Kardeşim bahçeye geldi ve yaşlı meşe ağacını kesmek istediğini söyledi.',
      },
      {
        id: 's-28',
        en: "That's going too far!",
        tr: 'Bu kadarı fazla!',
      },
      {
        id: 's-29',
        en: "That's going way too far!",
        tr: 'Bu kadarı gerçekten çok fazla!',
      },
      {
        id: 's-30',
        en: 'How come you never asked me first?',
        tr: 'Nasıl oluyor da önce bana hiç sormadın?',
      },
      {
        id: 's-31',
        en: 'He laughed and said he was not cut out to be a gardener.',
        tr: 'Güldü ve bahçıvanlık için biçilmiş kaftan olmadığını söyledi.',
      },
      {
        id: 's-32',
        en: 'What matters is that the tree stays here.',
        tr: 'Önemli olan ağacın burada kalması.',
      },
      {
        id: 's-33',
        en: 'Do I make myself clear?',
        tr: 'Anlatabildim mi?',
      },
      {
        id: 's-34',
        en: "He smiled and answered, \"I'll say!\"",
        tr: 'Gülümsedi ve "Hem de nasıl!" diye cevap verdi.',
      },
      {
        id: 's-35',
        en: 'This is the case for many old gardens.',
        tr: 'Bu, birçok eski bahçe için geçerli.',
      },
      {
        id: 's-36',
        en: 'In the end, we might as well plant a new tree next to it.',
        tr: 'Sonuçta yanına yeni bir ağaç da diksek iyi olur.',
      },
    ],
  ],
};

/**
 * 2. Word Pool: Learner's Vocabulary & Anki Cards
 * Cleaned for Phase 2 - now dynamically loaded from Anki import via IndexedDB.
 */
export const WORD_POOL: Record<string, WordCard> = {};

/**
 * 3. Sound Map: Each marker plays its own audio/text
 */
export const SOUNDS: Record<string, SoundEntry> = {};

