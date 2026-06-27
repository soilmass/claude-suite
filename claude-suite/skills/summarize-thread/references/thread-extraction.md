# thread-extraction — pulling a complete thread with the `gh` CLI before summarizing

A summary is only as good as its input. The most common upstream failure is summarizing a
truncated thread — the web UI collapses comments, and a copy-paste misses inline review remarks
and the comment that reversed an earlier decision. Always pull the full thread programmatically.

## Issues

```bash
# Full body + every comment, in order.
gh issue view <N> --comments

# Machine-readable: title, body, author, state, and the comments array.
gh issue view <N> --json title,body,author,state,createdAt,url,comments
```

The `comments` array gives you, per comment: `author.login`, `body`, `createdAt`, and `url`
(the permalink you cite in the digest).

## Pull requests

A PR has THREE comment surfaces. Miss any and the digest is wrong.

```bash
# 1. Conversation timeline (issue-style comments) + PR body.
gh pr view <N> --comments
gh pr view <N> --json title,body,author,state,createdAt,url,comments

# 2. Review summaries (APPROVED / CHANGES_REQUESTED / COMMENTED) — these often ARE the decision.
gh pr view <N> --json reviews
gh api repos/{owner}/{repo}/pulls/<N>/reviews

# 3. Inline code-review comments, with their resolved/unresolved state.
gh api repos/{owner}/{repo}/pulls/<N>/comments
```

Review state (`APPROVED` vs `CHANGES_REQUESTED`) is decision-state signal: an approval is a
Decision; an unresolved `CHANGES_REQUESTED` thread is an Action Item or Open Question.

## Discussions

```bash
# Discussions are GraphQL-only. Fetch body, comments, replies, and the chosen answer.
gh api graphql -f query='
  query($owner:String!, $repo:String!, $num:Int!) {
    repository(owner:$owner, name:$repo) {
      discussion(number:$num) {
        title body url
        answer { body author { login } url }
        comments(first:100) {
          nodes { body createdAt url author { login }
            replies(first:50) { nodes { body createdAt url author { login } } } }
        }
      }
    }
  }' -F owner=<owner> -F repo=<repo> -F num=<N>
```

The `answer` field, if present, is the marked-accepted answer — treat it as a Decision, but still
scan replies for later dissent that supersedes it.

## What to capture per comment

For every substantive comment, record these five fields — they are what the digest attribution
format in `digest-structure.md` consumes:

1. **author** (`@login`) — who said it.
2. **timestamp** (`createdAt`) — for ordering and "as of when."
3. **permalink** (`url`) — so the digest links back instead of quoting at length.
4. **resolved/state** — review resolved flag, review verdict, or accepted-answer flag.
5. **body** — the substance, to be classified.

## Filtering noise

Filter out CI bots, `dependabot`, `codecov`, and pure "+1"/emoji-only comments BEFORE
classifying — but note in the digest that you filtered, so the reader knows it is not the literal
full thread. Never filter out a human disagreement just because it was brief.

## When you cannot use `gh`

If the thread is pasted text (no repo access), apply the same capture: ask for or infer author and
ordering, and flag in the TL;DR that permalinks are unavailable so claims cannot be traced to a
source comment. A digest without traceable attribution is weaker — say so rather than hiding it.
