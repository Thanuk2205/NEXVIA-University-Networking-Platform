import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import PostCard from "../components/PostCard";

export default function CommunityWall() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await api.get("/posts");
    setPosts(res.data.posts);
  }

  async function handlePost(e) {
    e.preventDefault();
    if (!content.trim()) return;
    const res = await api.post("/posts", { content });
    setPosts([res.data.post, ...posts]);
    setContent("");
  }

  function handleUpdate(id, patch) {
    setPosts((prev) =>
      prev.map((p) => {
        if (p._id !== id) return p;
        const next = { ...p };
        if (patch.comments) next.comments = patch.comments;
        if (typeof patch.likesCount === "number") {
          next.likes = patch.liked
            ? [...(p.likes || []), user?.id]
            : (p.likes || []).slice(0, patch.likesCount);
        }
        return next;
      }),
    );
  }

  return (
    <div className="page">
      <h2>Community Wall</h2>
      {user && (
        <form className="card" onSubmit={handlePost}>
          <textarea
            placeholder="Share an opportunity, update, or insight with the network..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <button type="submit">Post</button>
        </form>
      )}
      <div className="feed">
        {posts.map((post) => (
          <PostCard
            key={post._id}
            post={post}
            currentUserId={user?.id}
            onUpdate={handleUpdate}
          />
        ))}
        {posts.length === 0 && (
          <p className="muted">
            No posts yet — be the first to share something.
          </p>
        )}
      </div>
    </div>
  );
}
