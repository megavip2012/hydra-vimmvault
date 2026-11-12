import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLinkIcon, SearchIcon } from "@primer/octicons-react";

import "./vimmvault-page.scss";

type VimmVaultGame = {
  id: string;
  title: string;
  platform: string;
  region: string | null;
  releaseYear: number | null;
  publisher: string | null;
  developer: string | null;
  cover: string | null;
  vimmUrl: string;
  linkStatus: "verified";
  availability?: {
    catalogued: true;
    downloadAvailable: boolean;
    authorizedDownload: boolean;
  };
  download: "[BRANCO]" | {
    authorized: true;
    uris: string[];
  };
};

type VimmVaultIndex = {
  schemaVersion: number;
  name: string;
  generatedAt: string | null;
  platforms: unknown[];
  games: VimmVaultGame[];
};

const CATALOGUE_URL =
  "https://raw.githubusercontent.com/megavip2012/Hydra-Launcher-Classics/main/catalog/index.json";
const CATALOGUE_CACHE_KEY = "vimmvault-catalogue-v1";

function parseCatalogue(value: unknown): VimmVaultGame[] | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<VimmVaultIndex>;
  if (payload.schemaVersion !== 1 || !Array.isArray(payload.games)) return null;
  return payload.games.filter(isValidGame);
}

function isValidGame(value: unknown): value is VimmVaultGame {
  if (!value || typeof value !== "object") return false;
  const game = value as Partial<VimmVaultGame>;
  if (
    typeof game.id !== "string" ||
    typeof game.title !== "string" ||
    typeof game.platform !== "string" ||
    game.linkStatus !== "verified" ||
    typeof game.vimmUrl !== "string" ||
    !/^https:\/\/vimm\.net\/vault\/\d+$/.test(game.vimmUrl)
  ) {
    return false;
  }

  if (game.download === "[BRANCO]") {
    return (
      game.availability?.downloadAvailable === false &&
      game.availability?.authorizedDownload === false
    );
  }

  return (
    Boolean(game.download) &&
    typeof game.download === "object" &&
    game.download.authorized === true &&
    Array.isArray(game.download.uris) &&
    game.download.uris.every(
      (uri) => typeof uri === "string" && /^https:\/\//.test(uri)
    )
  );
}

export default function VimmVaultPage() {
  const { t } = useTranslation("vimmvault");
  const [games, setGames] = useState<VimmVaultGame[]>([]);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadCatalogue = async () => {
      setLoading(true);
      setError(false);
      let hasCachedCatalogue = false;

      try {
        const cached = localStorage.getItem(CATALOGUE_CACHE_KEY);
        if (cached) {
          const cachedGames = parseCatalogue(JSON.parse(cached));
          if (cachedGames) {
            setGames(cachedGames);
            hasCachedCatalogue = true;
          }
        }
      } catch {
        try {
          localStorage.removeItem(CATALOGUE_CACHE_KEY);
        } catch {
          // Storage can be disabled by the host environment.
        }
      }

      try {
        const response = await fetch(CATALOGUE_URL, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`);

        const payload = (await response.json()) as Partial<VimmVaultIndex>;
        const validatedGames = parseCatalogue(payload);
        if (!validatedGames) {
          throw new Error("Invalid VimmVault catalogue format");
        }

        setGames(validatedGames);
        try {
          localStorage.setItem(CATALOGUE_CACHE_KEY, JSON.stringify(payload));
        } catch {
          // Browsing remains available when persistent storage is unavailable.
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error("Unable to load VimmVault catalogue", cause);
          setError(!hasCachedCatalogue);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadCatalogue();
    return () => controller.abort();
  }, []);

  const platforms = useMemo(
    () => Array.from(new Set(games.map((game) => game.platform))).sort(),
    [games]
  );

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return games.filter((game) => {
      const matchesPlatform = platform === "all" || game.platform === platform;
      const matchesQuery =
        !normalizedQuery ||
        game.title.toLocaleLowerCase().includes(normalizedQuery) ||
        game.platform.toLocaleLowerCase().includes(normalizedQuery) ||
        (game.developer ?? "").toLocaleLowerCase().includes(normalizedQuery) ||
        (game.publisher ?? "").toLocaleLowerCase().includes(normalizedQuery);
      return matchesPlatform && matchesQuery;
    });
  }, [games, platform, query]);

  return (
    <main className="vimmvault-page">
      <header className="vimmvault-page__header">
        <div>
          <span className="vimmvault-page__eyebrow">HYDRA CLASSICS</span>
          <h1>VimmVault</h1>
          <p>{t("description")}</p>
        </div>
        <a
          className="vimmvault-page__source"
          href="https://vimm.net/vault/"
          target="_blank"
          rel="noreferrer"
        >
          {t("open_vault")}
          <ExternalLinkIcon size={14} />
        </a>
      </header>

      <section className="vimmvault-page__toolbar" aria-label={t("filters")}>
        <label className="vimmvault-page__search">
          <SearchIcon size={16} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search_placeholder")}
          />
        </label>
        <select
          value={platform}
          onChange={(event) => setPlatform(event.target.value)}
          aria-label={t("platform")}
        >
          <option value="all">{t("all_platforms")}</option>
          {platforms.map((item) => (
            <option value={item} key={item}>{item}</option>
          ))}
        </select>
      </section>

      {loading ? (
        <div className="vimmvault-page__state">{t("loading")}</div>
      ) : error ? (
        <div className="vimmvault-page__state vimmvault-page__state--error">
          <h2>{t("load_error_title")}</h2>
          <p>{t("load_error_description")}</p>
          <button type="button" onClick={() => window.location.reload()}>
            {t("retry")}
          </button>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="vimmvault-page__state">
          <h2>{games.length === 0 ? t("catalogue_empty_title") : t("no_results_title")}</h2>
          <p>{games.length === 0 ? t("catalogue_empty_description") : t("no_results_description")}</p>
        </div>
      ) : (
        <>
          <div className="vimmvault-page__count">
            {t("games_count", { count: filteredGames.length })}
          </div>
          <div className="vimmvault-page__grid">
            {filteredGames.map((game) => (
              <article className="vimmvault-card" key={game.id}>
                <div className="vimmvault-card__cover">
                  {game.cover ? (
                    <img src={game.cover} alt="" loading="lazy" />
                  ) : (
                    <span>{game.platform}</span>
                  )}
                </div>
                <div className="vimmvault-card__body">
                  <h2 title={game.title}>{game.title}</h2>
                  <p>{game.platform}{game.releaseYear ? ` · ${game.releaseYear}` : ""}</p>
                  {game.region && <span className="vimmvault-card__region">{game.region}</span>}
                  <a href={game.vimmUrl} target="_blank" rel="noreferrer">
                    {t("view_vimm_page")}
                    <ExternalLinkIcon size={13} />
                  </a>
                  {game.download === "[BRANCO]" && (
                    <span className="vimmvault-card__catalog-only">{t("catalog_only")}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
