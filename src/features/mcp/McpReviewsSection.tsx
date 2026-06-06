import { useCallback, useEffect, useMemo, useState } from "react";
import { FaStar } from "../../icons";
import { Button, Input, Text, XStack, YStack } from "tamagui";
import { McpPanel } from "./McpPanel";
import {
  computeReviewStats,
  createMcpReview,
  fetchMcpReviews,
  type McpReview,
} from "../../services/mcp_reviews";
import { borders, colors, market, tamaguiSurfaces } from "../../theme";

type McpReviewsSectionProps = {
  serverName: string;
};

function StarRow({
  rating,
  size = 14,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <XStack gap={3} items="center">
      {Array.from({ length: 5 }).map((_, index) => (
        <FaStar
          key={index}
          size={size}
          color={index < Math.round(rating) ? market.star : market.starMuted}
        />
      ))}
    </XStack>
  );
}

function InteractiveStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <XStack gap={6}>
      {Array.from({ length: 5 }).map((_, index) => {
        const rating = index + 1;
        return (
          <Button
            key={rating}
            unstyled
            onPress={() => onChange(rating)}
            aria-label={`Rate ${rating} stars`}
          >
            <FaStar
              size={22}
              color={rating <= value ? market.star : market.starMuted}
            />
          </Button>
        );
      })}
    </XStack>
  );
}

function ReviewItem({ review }: { review: McpReview }) {
  const date = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(review.createdAt));

  return (
    <McpPanel p={14} gap={10}>
      <XStack justify="space-between" items="center" gap={12}>
        <StarRow rating={review.rating} size={12} />
        <Text color={colors.muted} fontSize={12}>
          {date}
        </Text>
      </XStack>
      {review.comment ? (
        <Text color={colors.foreground} fontSize={14} lineHeight={21}>
          {review.comment}
        </Text>
      ) : (
        <Text color={colors.muted} fontSize={13}>
          No comment provided.
        </Text>
      )}
    </McpPanel>
  );
}

export function McpReviewsSection({ serverName }: McpReviewsSectionProps) {
  const [reviews, setReviews] = useState<McpReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftComment, setDraftComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const stats = useMemo(() => computeReviewStats(reviews), [reviews]);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReviews(await fetchMcpReviews(serverName));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [serverName]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const handleSubmit = async () => {
    if (draftRating < 1) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const created = await createMcpReview(serverName, {
        rating: draftRating,
        comment: draftComment.trim(),
      });
      setReviews((current) => [created, ...current]);
      setDraftComment("");
      setDraftRating(5);
      setShowForm(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <YStack gap={16}>
      <Text color={colors.foreground} fontSize={18} fontWeight="700">
        Reviews
      </Text>

      <XStack gap={20} items="flex-start" flexWrap="wrap">
        <YStack
          width={220}
          shrink={0}
          gap={12}
          style={{ position: "sticky", top: 0, alignSelf: "flex-start" }}
        >
          <McpPanel p={16} gap={12}>
            <Text color={colors.foreground} fontSize={36} fontWeight="700" lineHeight={40}>
              {stats.totalReviews > 0 ? stats.averageRating.toFixed(1) : "—"}
            </Text>
            <StarRow rating={stats.averageRating} size={16} />
            <Text color={colors.muted} fontSize={13}>
              {stats.totalReviews}{" "}
              {stats.totalReviews === 1 ? "review" : "reviews"}
            </Text>
            <Button
              unstyled
              px={12}
              py={9}
              rounded={8}
              bg={tamaguiSurfaces.activeBg}
              borderWidth={1}
              borderColor={borders.strong}
              hoverStyle={{ bg: borders.focus }}
              onPress={() => setShowForm((current) => !current)}
            >
              <Text color={colors.foreground} fontSize={13} fontWeight="600">
                {showForm ? "Cancel" : "Add review"}
              </Text>
            </Button>
          </McpPanel>

          {showForm ? (
            <McpPanel p={16} gap={12}>
              <Text color={colors.foreground} fontSize={14} fontWeight="600">
                Your rating
              </Text>
              <InteractiveStars value={draftRating} onChange={setDraftRating} />
              <Input
                value={draftComment}
                onChangeText={setDraftComment}
                placeholder="Share your experience…"
                color={colors.foreground}
                placeholderTextColor={colors.muted as never}
                bg={tamaguiSurfaces.controlBg}
                borderWidth={1}
                borderColor={tamaguiSurfaces.activeBg}
                rounded={8}
                px={12}
                py={10}
                fontSize={13}
                multiline
                numberOfLines={4}
              />
              <Button
                unstyled
                px={12}
                py={9}
                rounded={8}
                bg={borders.strong}
                opacity={submitting ? 0.6 : 1}
                disabled={submitting}
                onPress={() => void handleSubmit()}
              >
                <Text color={colors.foreground} fontSize={13} fontWeight="600">
                  {submitting ? "Submitting…" : "Submit review"}
                </Text>
              </Button>
            </McpPanel>
          ) : null}
        </YStack>

        <YStack flex={1} minW={280} gap={12}>
          {loading ? (
            <Text color={colors.muted} fontSize={14}>
              Loading reviews…
            </Text>
          ) : null}

          {error ? (
            <Text color={colors.error} fontSize={14}>
              {error}
            </Text>
          ) : null}

          {!loading && reviews.length === 0 ? (
            <Text color={colors.muted} fontSize={14}>
              No reviews yet. Be the first to share feedback.
            </Text>
          ) : null}

          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
        </YStack>
      </XStack>
    </YStack>
  );
}
