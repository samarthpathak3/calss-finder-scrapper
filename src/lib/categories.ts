/**
 * Search categories.
 *   googleQueries: phrases sent to Google Places ("<phrase> near <zip>").
 *   keywords:      name searches for the free OpenStreetMap/Photon source.
 *   osmTags:       OpenStreetMap tags that mark a place as this category even if its name doesn't say so.
 */
export interface CategorySpec {
  googleQueries: string[];
  keywords: string[];
  osmTags: Record<string, string[]>;
}

export const CATEGORIES: Record<string, CategorySpec> = {
  "Karate / Martial Arts": {
    googleQueries: ["karate classes", "martial arts school", "taekwondo classes"],
    keywords: ["karate", "martial arts", "taekwondo", "dojo", "jiu jitsu", "kung fu"],
    osmTags: {
      amenity: ["dojo"],
      sport: ["karate", "martial_arts", "taekwondo", "judo", "jiu-jitsu", "kickboxing", "aikido", "kung_fu"],
    },
  },
  "Art Classes": {
    googleQueries: ["art classes for kids", "art studio classes", "painting drawing classes"],
    keywords: ["art studio", "art school", "art class", "arts center", "pottery", "painting class"],
    osmTags: { amenity: ["arts_centre"] },
  },
  "Dance Classes": {
    googleQueries: ["dance classes", "dance studio", "ballet school"],
    keywords: ["dance studio", "dance academy", "dance school", "ballet"],
    osmTags: { amenity: ["dancing_school"], leisure: ["dance"] },
  },
  "Afterschool Programs": {
    googleQueries: ["after school program", "afterschool enrichment for kids", "kids learning center"],
    keywords: ["after school", "afterschool", "tutoring", "learning center", "kumon", "mathnasium"],
    osmTags: { amenity: ["childcare"] },
  },
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES);

/** Words too generic to prove a name belongs to a category on their own. */
export const GENERIC_WORDS = new Set(["studio", "school", "class", "classes", "center", "centre", "academy", "the", "of"]);
