// Collects the Telemetry record from the GitHub GraphQL API.
// Three questions, asked in order: who is the user and what is in the last year
// of contributions; which repositories they own; when they wrote each commit.

import type { Day, Language, Telemetry } from './model';

const ENDPOINT = 'https://api.github.com/graphql';
const YEAR_MS = 365 * 24 * 3600 * 1000;

type Gql = <T>(query: string, variables: Record<string, unknown>) => Promise<T>;

function client(token: string): Gql {
    return async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ query, variables }),
        });
        const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
        if (!res.ok || body.errors || !body.data) {
            throw new Error(`GraphQL ${res.status}: ${body.errors?.map((e) => e.message).join('; ') ?? res.statusText}`);
        }
        return body.data;
    };
}

// -- 1. profile and contributions ---------------------------------------------

interface ProfileData {
    user: {
        id: string;
        followers: { totalCount: number };
        contributionsCollection: {
            totalCommitContributions: number;
            totalPullRequestContributions: number;
            totalIssueContributions: number;
            contributionCalendar: { weeks: { contributionDays: Day[] }[] };
            commitContributionsByRepository: {
                repository: { nameWithOwner: string; primaryLanguage: { name: string; color: string | null } | null };
                contributions: { totalCount: number };
            }[];
        };
    };
}

const PROFILE = `query($login: String!) {
  user(login: $login) {
    id
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      contributionCalendar { weeks { contributionDays { date: date count: contributionCount } } }
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner primaryLanguage { name color } }
        contributions { totalCount }
      }
    }
  }
}`;

// -- 2. owned repositories (paged) --------------------------------------------

interface RepoPage {
    user: {
        repositories: {
            totalCount: number;
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: { stargazerCount: number }[];
        };
    };
}

const REPOS = `query($login: String!, $after: String) {
  user(login: $login) {
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { stargazerCount }
    }
  }
}`;

async function repositories(gql: Gql, login: string): Promise<{ count: number; stars: number }> {
    let after: string | null = null;
    let stars = 0;
    let count = 0;
    do {
        const page: RepoPage = await gql<RepoPage>(REPOS, { login, after });
        const r = page.user.repositories;
        count = r.totalCount;
        stars += r.nodes.reduce((s, n) => s + n.stargazerCount, 0);
        after = r.pageInfo.hasNextPage ? r.pageInfo.endCursor : null;
    } while (after);
    return { count, stars };
}

// -- 3. commit times (paged per repository) -----------------------------------

interface HistoryPage {
    repository: {
        defaultBranchRef: {
            target: {
                history?: {
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                    nodes: { authoredDate: string }[];
                };
            };
        } | null;
    } | null;
}

const HISTORY = `query($owner: String!, $name: String!, $author: ID!, $since: GitTimestamp!, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { target { ... on Commit {
      history(author: { id: $author }, since: $since, first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { authoredDate }
      }
    } } }
  }
}`;

async function commitDates(gql: Gql, nameWithOwner: string, author: string, since: string): Promise<string[]> {
    const [owner, name] = nameWithOwner.split('/');
    const dates: string[] = [];
    let after: string | null = null;
    do {
        const page: HistoryPage = await gql<HistoryPage>(HISTORY, { owner, name, author, since, after });
        const h = page.repository?.defaultBranchRef?.target.history;
        if (!h) break; // empty repository, or no access
        for (const n of h.nodes) dates.push(n.authoredDate);
        after = h.pageInfo.hasNextPage ? h.pageInfo.endCursor : null;
    } while (after);
    return dates;
}

function hourIn(timeZone: string): (iso: string) => number {
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' });
    return (iso) => Number(fmt.format(new Date(iso))) % 24;
}

// -- the record ---------------------------------------------------------------

export async function collect(login: string, token: string, timeZone: string, now = new Date()): Promise<Telemetry> {
    const gql = client(token);
    const { user } = await gql<ProfileData>(PROFILE, { login });
    const c = user.contributionsCollection;

    const repos = await repositories(gql, login);

    // Commits per language: each repository's commits count for its primary language
    const byLanguage = new Map<string, Language>();
    for (const r of c.commitContributionsByRepository) {
        const lang = r.repository.primaryLanguage;
        if (!lang) continue;
        const entry = byLanguage.get(lang.name) ?? { name: lang.name, color: lang.color, commits: 0 };
        entry.commits += r.contributions.totalCount;
        byLanguage.set(lang.name, entry);
    }

    // Commits per local hour, over the same year
    const since = new Date(now.getTime() - YEAR_MS).toISOString();
    const hour = hourIn(timeZone);
    const hours = new Array<number>(24).fill(0);
    for (const r of c.commitContributionsByRepository) {
        for (const d of await commitDates(gql, r.repository.nameWithOwner, user.id, since)) hours[hour(d)]!++;
    }

    return {
        login,
        generatedAt: now.toISOString(),
        timeZone,
        totals: {
            commits: c.totalCommitContributions,
            pullRequests: c.totalPullRequestContributions,
            issues: c.totalIssueContributions,
            stars: repos.stars,
            followers: user.followers.totalCount,
            repos: repos.count,
        },
        calendar: c.contributionCalendar.weeks.flatMap((w) => w.contributionDays),
        languages: [...byLanguage.values()].sort((a, b) => b.commits - a.commits),
        hours,
    };
}
