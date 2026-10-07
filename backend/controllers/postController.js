const Post = require('../models/Post');

// POST /api/posts
async function createPost(req, res) {
  try {
    const { content, linkUrl, tags } = req.body;
    if (!content) return res.status(400).json({ message: 'content is required' });

    const post = await Post.create({ author: req.user._id, content, linkUrl, tags });
    const populated = await post.populate('author', 'name role academicProfile companyProfile');
    res.status(201).json({ post: populated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create post', error: err.message });
  }
}

// GET /api/posts — the community wall feed, newest first
async function listPosts(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    const posts = await Post.find()
      .populate('author', 'name role academicProfile companyProfile')
      .populate('comments.author', 'name role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ posts, page });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load feed', error: err.message });
  }
}

// POST /api/posts/:id/like — toggle like
async function toggleLike(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const uid = String(req.user._id);
    const idx = post.likes.findIndex((l) => String(l) === uid);
    if (idx >= 0) post.likes.splice(idx, 1);
    else post.likes.push(req.user._id);

    await post.save();
    res.json({ likes: post.likes.length, liked: idx < 0 });
  } catch (err) {
    res.status(500).json({ message: 'Failed to toggle like', error: err.message });
  }
}

// POST /api/posts/:id/comments
async function addComment(req, res) {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'text is required' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.comments.push({ author: req.user._id, text });
    await post.save();
    const populated = await post.populate('comments.author', 'name role');
    res.status(201).json({ comments: populated.comments });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add comment', error: err.message });
  }
}

// DELETE /api/posts/:id — author or admin only
async function deletePost(req, res) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (String(post.author) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }
    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete post', error: err.message });
  }
}

module.exports = { createPost, listPosts, toggleLike, addComment, deletePost };
