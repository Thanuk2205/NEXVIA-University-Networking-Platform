import { useState } from "react";
import api from "../api/axios";

export default function PostCard({ post, currentUserId, onUpdate }) {
  const [commentText, setCommentText] = useState("");
  const liked = post.likes?.some(
    (id) => id === currentUserId || id?._id === currentUserId,
  );

  async function handleLike() {
    const res = await api.post(`/posts/${post._id}/like`);
    onUpdate?.(post._id, { likesCount: res.data.likes, liked: res.data.liked });
  }

  async function handleComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const res = await api.post(`/posts/${post._id}/comments`, {
      text: commentText,
    });
    setCommentText("");
    onUpdate?.(post._id, { comments: res.data.comments });
  }

  return (
    <div className="card post-card">
      <div className="post-author">
        <strong>{post.author?.name}</strong>
        <span className="muted"> · {post.author?.role}</span>
      </div>
      <p>{post.content}</p>
      {post.linkUrl && (
        <a href={post.linkUrl} target="_blank" rel="noreferrer">
          {post.linkUrl}
        </a>
      )}
      <div className="post-actions">
        <button className="link-btn" onClick={handleLike}>
          {liked ? "♥" : "♡"} {post.likes?.length ?? 0}
        </button>
        <span className="muted">{post.comments?.length ?? 0} comments</span>
      </div>
      <div className="comments">
        {post.comments?.map((c) => (
          <div key={c._id} className="comment">
            <strong>{c.author?.name}: </strong>
            {c.text}
          </div>
        ))}
      </div>
      <form onSubmit={handleComment} className="comment-form">
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Write a comment..."
        />
        <button type="submit">Post</button>
      </form>
    </div>
  );
}
