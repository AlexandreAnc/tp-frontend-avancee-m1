declare module '#app' {
  interface PageMeta {
    /** Page du site public (landing, blog) : pré-rendue, sans session ni verrouillage. */
    marketing?: boolean;
  }
}

export {};
