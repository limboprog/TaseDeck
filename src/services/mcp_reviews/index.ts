export type McpReview = {
  id: string;
  userId: string | null;
  rating: number;
  comment: string;
  createdAt: string;
};

export type CreateMcpReview = {
  rating: number;
  comment: string;
};

export type ReviewStats = {
  averageRating: number;
  totalReviews: number;
};

const API_BASE = import.meta.env.VITE_MCP_API_BASE ?? "http://localhost:8080";

function reviewPath(serverName: string) {
  return `${API_BASE}/api/v1/mcp/servers/${encodeURIComponent(serverName)}/reviews`;
}

export async function fetchMcpReviews(serverName: string) {
  const response = await fetch(reviewPath(serverName), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load reviews (${response.status})`);
  }

  const data = (await response.json()) as Array<{
    id: string;
    user_id: string | null;
    rating: number;
    comment: string;
    created_at: string;
  }>;

  return data.map(
    (item): McpReview => ({
      id: item.id,
      userId: item.user_id,
      rating: item.rating,
      comment: item.comment,
      createdAt: item.created_at,
    }),
  );
}

export async function createMcpReview(serverName: string, payload: CreateMcpReview) {
  const response = await fetch(reviewPath(serverName), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rating: payload.rating,
      comment: payload.comment,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit review (${response.status})`);
  }

  const item = (await response.json()) as {
    id: string;
    user_id: string | null;
    rating: number;
    comment: string;
    created_at: string;
  };

  return {
    id: item.id,
    userId: item.user_id,
    rating: item.rating,
    comment: item.comment,
    createdAt: item.created_at,
  } satisfies McpReview;
}

export function computeReviewStats(reviews: McpReview[]): ReviewStats {
  if (reviews.length === 0) {
    return { averageRating: 0, totalReviews: 0 };
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return {
    averageRating: Math.round((total / reviews.length) * 10) / 10,
    totalReviews: reviews.length,
  };
}
