import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox
import json
import math

# --- USER CONFIG ---
# SCALE: how many real TFT pixels each editor pixel represents.
# Must match FACE_SCALE in heart_rate_v1.cpp.
# e.g. SCALE=4 → COLS=60, ROWS=34 displayed as 240x136 on the TFT.
SCALE = 4
PIXEL_SIZE = 16      # Size of each square in the editor (pixels on screen). Change freely.
# --- derived (do not edit) ---
COLS = 240 // SCALE
ROWS = 136 // SCALE
OFFSET = 40

class AnimatedPixelArtCreator:
    def __init__(self, root):
        self.root = root
        self.root.title("TFT_eSPI Animation Designer")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
        self.frames = [[["#000000" for _ in range(COLS)] for _ in range(ROWS)]]
        self.current_frame_idx = 0
        self.palette_colors = ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]
        self.selected_color = "#FFFFFF"
        self.anim_speed = tk.IntVar(value=150)
        
        self.show_grid = tk.BooleanVar(value=True)
        self.show_numbers = tk.BooleanVar(value=True)
        self.show_center = tk.BooleanVar(value=True)
        
        self.palette_widgets = []

        # --- Select mode state ---
        self.select_mode = False
        self.sel_anchor = None   # (r, c) where drag started
        self.sel_box = None      # (r0, c0, r1, c1) normalized bounding box
        self.sel_highlight = []  # canvas item IDs for the yellow selection overlay
        self.clipboard = None    # {(rel_r, rel_c): color} snapshot for copy/paste
        self.clipboard_size = None

        # --- Undo history (per frame index) ---
        self.history = {}        # {frame_idx: [snapshot, ...]}
        self.MAX_HISTORY = 50

        # --- Shape / tool state ---
        self.current_tool = "draw"   # draw | bucket | circle | rect | tri
        self.shape_fill = tk.BooleanVar(value=True)
        self.shape_anchor = None     # (r, c) where shape drag started
        self.shape_preview_items = []
        self.tool_btns = {}

        self.setup_ui()
        self.init_grid()
        self.update_frame_view()
        self.start_live_preview()

    def setup_ui(self):
        self.top_bar = tk.Frame(self.root, bg="#1c2833")
        self.top_bar.pack(side=tk.TOP, fill=tk.X)
        
        tk.Label(self.top_bar, text=" PROJECT MANAGEMENT", fg="white", bg="#1c2833", font=("Arial", 9, "bold")).pack(side=tk.LEFT, padx=10)
        tk.Button(self.top_bar, text="SAVE PROJECT", command=self.save_project, bg="#f39c12", fg="black", font=("Arial", 8, "bold"), width=15).pack(side=tk.RIGHT, padx=5, pady=5)
        tk.Button(self.top_bar, text="LOAD PROJECT", command=self.load_project, bg="#3498db", fg="black", font=("Arial", 8, "bold"), width=15).pack(side=tk.RIGHT, padx=5, pady=5)

        self.main_frame = tk.Frame(self.root)
        self.main_frame.pack(padx=10, pady=10)

        self.canvas = tk.Canvas(self.main_frame, width=COLS*PIXEL_SIZE + OFFSET + 20, height=ROWS*PIXEL_SIZE + OFFSET + 20, bg="#1a1a1a", highlightthickness=0)
        self.canvas.pack(side=tk.LEFT)
        self.canvas.bind("<Button-1>", self.on_canvas_click)
        self.canvas.bind("<B1-Motion>", self.on_canvas_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_canvas_release)
        self.canvas.bind("<Button-3>", self.erase)
        self.root.bind("<Left>",      lambda e: self.move_selection(0, -1))
        self.root.bind("<Right>",     lambda e: self.move_selection(0,  1))
        self.root.bind("<Up>",        lambda e: self.move_selection(-1, 0))
        self.root.bind("<Down>",      lambda e: self.move_selection( 1, 0))
        self.root.bind("<Escape>",    lambda e: self.clear_selection())
        self.root.bind("<Delete>",    lambda e: self.delete_selection())
        self.root.bind("<BackSpace>", lambda e: self.delete_selection())
        self.root.bind("<Control-c>", lambda e: self.copy_selection())
        self.root.bind("<Control-v>", lambda e: self.paste_selection())
        self.root.bind("<Control-z>", lambda e: self.undo())

        self.sidebar = tk.Frame(self.main_frame, padx=15)
        self.sidebar.pack(side=tk.RIGHT, fill=tk.Y)

        # --- LIVE PREVIEW ---
        tk.Label(self.sidebar, text="LIVE PREVIEW", font=("Arial", 9, "bold")).pack(pady=(0,5))
        self.preview_canvas = tk.Canvas(self.sidebar, width=COLS, height=ROWS, bg="black", highlightthickness=1, highlightbackground="white")
        self.preview_canvas.pack(pady=5)

        # --- View Options ---
        tk.Label(self.sidebar, text="VIEW SETTINGS", font=("Arial", 9, "bold")).pack(pady=(10,2))
        tk.Checkbutton(self.sidebar, text="Show Grid", variable=self.show_grid, command=self.refresh_canvas_style).pack(anchor="w")
        tk.Checkbutton(self.sidebar, text="Show Numbers", variable=self.show_numbers, command=self.refresh_canvas_style).pack(anchor="w")
        tk.Checkbutton(self.sidebar, text="Center Lines", variable=self.show_center, command=self.refresh_canvas_style).pack(anchor="w")

        # --- Speed ---
        tk.Label(self.sidebar, text="SPEED (ms delay)", font=("Arial", 9, "bold")).pack(pady=(10,0))
        tk.Scale(self.sidebar, from_=50, to=1000, orient=tk.HORIZONTAL, variable=self.anim_speed).pack(fill=tk.X)

        # --- Navigation ---
        self.frame_label = tk.Label(self.sidebar, text="Frame: 1 / 1", font=("Arial", 10, "bold"))
        self.frame_label.pack(pady=10)

        nav_frame = tk.Frame(self.sidebar)
        nav_frame.pack()
        tk.Button(nav_frame, text="◀ PREV", command=self.prev_frame, width=8, fg="black", bg="#bdc3c7").pack(side=tk.LEFT, padx=2)
        tk.Button(nav_frame, text="NEXT ▶", command=self.next_frame, width=8, fg="black", bg="#bdc3c7").pack(side=tk.LEFT, padx=2)
        
        tk.Label(self.sidebar, text="Clone from Frame #:", font=("Arial", 8)).pack(pady=(10,0))
        clone_row = tk.Frame(self.sidebar)
        clone_row.pack()
        self.clone_idx_var = tk.StringVar(value="1")
        tk.Entry(clone_row, textvariable=self.clone_idx_var, width=5).pack(side=tk.LEFT)
        tk.Button(clone_row, text="CLONE", command=self.clone_specific_frame, bg="#95a5a6", fg="black", font=("Arial", 8, "bold")).pack(side=tk.LEFT, padx=2)

        tk.Button(self.sidebar, text="DELETE CURRENT", command=self.delete_frame, fg="black", bg="#95a5a6", font=("Arial", 8, "bold")).pack(fill=tk.X, pady=10)

        # --- Palette Section ---
        tk.Label(self.sidebar, text="PALETTE", font=("Arial", 9, "bold")).pack(pady=(10,0))
        tk.Label(self.sidebar, text="Right-Click to change colour", font=("Arial", 7, "italic"), fg="gray").pack(pady=(0,5))
        
        self.active_indicator = tk.Canvas(self.sidebar, width=60, height=20, bg=self.selected_color, highlightthickness=1)
        self.active_indicator.pack(pady=5)

        for i in range(8):
            p = tk.Canvas(self.sidebar, width=100, height=20, bg=self.palette_colors[i], highlightthickness=1)
            p.bind("<Button-1>", lambda e, idx=i: self.select_color(idx))
            p.bind("<Button-3>", lambda e, idx=i: self.open_color_wheel(idx)) # Right-click bind
            p.pack(pady=1)
            self.palette_widgets.append(p)

        # --- Tools Section ---
        tk.Label(self.sidebar, text="TOOLS", font=("Arial", 9, "bold")).pack(pady=(10, 2))
        tool_row1 = tk.Frame(self.sidebar)
        tool_row1.pack(pady=1)
        for name, label in [("draw", "DRAW"), ("bucket", "BUCKET")]:
            b = tk.Button(tool_row1, text=label, width=7, font=("Arial", 8),
                          command=lambda n=name: self.set_tool(n), bg="#bdc3c7", fg="black")
            b.pack(side=tk.LEFT, padx=1)
            self.tool_btns[name] = b
        tool_row2 = tk.Frame(self.sidebar)
        tool_row2.pack(pady=1)
        for name, label in [("circle", "CIRCLE"), ("rect", "RECT"), ("tri", "TRI")]:
            b = tk.Button(tool_row2, text=label, width=6, font=("Arial", 8),
                          command=lambda n=name: self.set_tool(n), bg="#bdc3c7", fg="black")
            b.pack(side=tk.LEFT, padx=1)
            self.tool_btns[name] = b
        tk.Checkbutton(self.sidebar, text="Fill shapes", variable=self.shape_fill,
                       font=("Arial", 8)).pack(anchor="w")
        self.set_tool("draw")  # highlight default

        # Bottom bar: EXPORT above SELECT MODE
        bottom_bar = tk.Frame(self.sidebar)
        bottom_bar.pack(side=tk.BOTTOM, fill=tk.X)

        # Use Label+Frame so bg colour renders correctly on macOS
        self.sel_btn_frame = tk.Frame(bottom_bar, bg="#555555")
        self.sel_btn_frame.pack(fill=tk.X)

        tk.Button(bottom_bar, text="EXPORT .H FILE", command=self.export_to_file, bg="#2ecc71", fg="black", font=("Arial", 10, "bold"), height=2).pack(fill=tk.X, pady=(2, 0))
        self.select_btn = tk.Label(self.sel_btn_frame, text="SELECT MODE: OFF",
                                   bg="#555555", fg="white", font=("Arial", 8, "bold"),
                                   cursor="hand2", pady=4)
        self.select_btn.pack(fill=tk.X)
        self.select_btn.bind("<Button-1>", lambda e: self.toggle_select_mode())

    def open_color_wheel(self, idx):
        """Opens the OS color wheel and updates the palette slot."""
        color = colorchooser.askcolor(title="Choose Palette Colour", initialcolor=self.palette_colors[idx])
        if color[1]: # color[1] is the hex value
            self.palette_colors[idx] = color[1]
            self.palette_widgets[idx].config(bg=color[1])
            self.select_color(idx) # Automatically select the new colour

    def select_color(self, idx):
        self.selected_color = self.palette_colors[idx]
        self.active_indicator.config(bg=self.selected_color)

    def start_live_preview(self):
        self.preview_frame_idx = 0
        self.animate_preview()

    def animate_preview(self):
        self.preview_canvas.delete("all")
        if self.frames:
            if self.preview_frame_idx >= len(self.frames):
                self.preview_frame_idx = 0
            
            f = self.frames[self.preview_frame_idx]
            for r in range(ROWS):
                for c in range(COLS):
                    if f[r][c] != "#000000":
                        self.preview_canvas.create_rectangle(c, r, c+1, r+1, fill=f[r][c], outline="")
            
            self.preview_frame_idx = (self.preview_frame_idx + 1) % len(self.frames)
        
        self.root.after(self.anim_speed.get(), self.animate_preview)

    def init_grid(self):
        self.rects = [[None for _ in range(COLS)] for _ in range(ROWS)]
        self.texts = []
        for r in range(ROWS):
            if (r + 1) % 10 == 0:
                y_pos = (r * PIXEL_SIZE) + OFFSET + (PIXEL_SIZE / 2) + 6
                t = self.canvas.create_text(OFFSET - 12, y_pos, text=str(r+1), fill="#888888", font=("Arial", 8))
                self.texts.append(t)
            for c in range(COLS):
                if r == 0 and (c + 1) % 10 == 0:
                    x_pos = (c * PIXEL_SIZE) + OFFSET + (PIXEL_SIZE / 2) + 6
                    t_col = self.canvas.create_text(x_pos, OFFSET - 12, text=str(c+1), fill="#888888", font=("Arial", 8))
                    self.texts.append(t_col)
                x1, y1 = c * PIXEL_SIZE + OFFSET, r * PIXEL_SIZE + OFFSET
                self.rects[r][c] = self.canvas.create_rectangle(x1, y1, x1+PIXEL_SIZE, y1+PIXEL_SIZE, fill="#000000", outline="#222222")
        
        mid_x = (COLS // 2) * PIXEL_SIZE + OFFSET
        mid_y = (ROWS // 2) * PIXEL_SIZE + OFFSET
        self.center_lines = [
            self.canvas.create_line(mid_x, 5, mid_x, ROWS*PIXEL_SIZE+OFFSET+5, fill="#e74c3c", dash=(4,4), width=1),
            self.canvas.create_line(5, mid_y, COLS*PIXEL_SIZE+OFFSET+5, mid_y, fill="#e74c3c", dash=(4,4), width=1)
        ]
        self.refresh_canvas_style()

    def refresh_canvas_style(self):
        outline_color = "#222222" if self.show_grid.get() else ""
        for r in range(ROWS):
            for c in range(COLS):
                self.canvas.itemconfig(self.rects[r][c], outline=outline_color)
        text_state = "normal" if self.show_numbers.get() else "hidden"
        for t_id in self.texts: self.canvas.itemconfig(t_id, state=text_state)
        center_state = "normal" if self.show_center.get() else "hidden"
        for l_id in self.center_lines: self.canvas.itemconfig(l_id, state=center_state)

    def toggle_select_mode(self):
        self.select_mode = not self.select_mode
        if self.select_mode:
            self.sel_btn_frame.config(bg="#f39c12")
            self.select_btn.config(text="SELECT MODE: ON", bg="#f39c12", fg="black")
        else:
            self.sel_btn_frame.config(bg="#555555")
            self.select_btn.config(text="SELECT MODE: OFF", bg="#555555", fg="white")
            self.clear_selection()

    def _cell(self, event):
        """Return (r, c) clamped to grid, or None if outside."""
        c = (event.x - OFFSET) // PIXEL_SIZE
        r = (event.y - OFFSET) // PIXEL_SIZE
        if 0 <= r < ROWS and 0 <= c < COLS:
            return r, c
        return None

    def on_canvas_click(self, event):
        if self.select_mode:
            cell = self._cell(event)
            if cell:
                self.sel_anchor = cell
                self.sel_box = (*cell, *cell)
                self.draw_selection()
        elif self.current_tool == "bucket":
            cell = self._cell(event)
            if cell:
                self.bucket_fill(*cell)
        elif self.current_tool in ("circle", "rect", "tri"):
            cell = self._cell(event)
            if cell:
                self.shape_anchor = cell
        else:
            self.push_history()
            self.paint(event)

    def on_canvas_drag(self, event):
        if self.select_mode:
            cell = self._cell(event)
            if cell and self.sel_anchor:
                ar, ac = self.sel_anchor
                er, ec = cell
                self.sel_box = (min(ar, er), min(ac, ec), max(ar, er), max(ac, ec))
                self.draw_selection()
        elif self.current_tool in ("circle", "rect", "tri") and self.shape_anchor:
            cell = self._cell(event)
            if cell:
                self._preview_shape(self.shape_anchor, cell)
        else:
            self.paint(event)

    def on_canvas_release(self, event):
        if self.current_tool in ("circle", "rect", "tri") and self.shape_anchor:
            cell = self._cell(event)
            if cell:
                self._commit_shape(self.shape_anchor, cell)
            else:
                self._clear_shape_preview()
            self.shape_anchor = None

    def draw_selection(self):
        for item in self.sel_highlight:
            self.canvas.delete(item)
        self.sel_highlight = []
        if self.sel_box is None:
            return
        r0, c0, r1, c1 = self.sel_box
        x1 = c0 * PIXEL_SIZE + OFFSET
        y1 = r0 * PIXEL_SIZE + OFFSET
        x2 = (c1 + 1) * PIXEL_SIZE + OFFSET
        y2 = (r1 + 1) * PIXEL_SIZE + OFFSET
        # Thick yellow border around the whole selection
        self.sel_highlight.append(
            self.canvas.create_rectangle(x1, y1, x2, y2, outline="#FFD700", width=2)
        )
        # Dashed yellow vertical lines from top and bottom of selection to canvas edges
        for cx in (x1, x2):
            self.sel_highlight.append(
                self.canvas.create_line(cx, OFFSET, cx, y1, fill="#FFD700", dash=(4, 3), width=1)
            )
            self.sel_highlight.append(
                self.canvas.create_line(cx, y2, cx, ROWS * PIXEL_SIZE + OFFSET, fill="#FFD700", dash=(4, 3), width=1)
            )

    def clear_selection(self):
        self.sel_anchor = None
        self.sel_box = None
        for item in self.sel_highlight:
            self.canvas.delete(item)
        self.sel_highlight = []

    def delete_selection(self):
        if not self.select_mode or self.sel_box is None:
            return
        self.push_history()
        r0, c0, r1, c1 = self.sel_box
        frame = self.frames[self.current_frame_idx]
        for r in range(r0, r1 + 1):
            for c in range(c0, c1 + 1):
                frame[r][c] = "#000000"
                self.canvas.itemconfig(self.rects[r][c], fill="#000000")
        self.clear_selection()

    def push_history(self):
        idx = self.current_frame_idx
        frame = self.frames[idx]
        stack = self.history.setdefault(idx, [])
        stack.append([row[:] for row in frame])
        if len(stack) > self.MAX_HISTORY:
            stack.pop(0)

    def undo(self):
        idx = self.current_frame_idx
        stack = self.history.get(idx, [])
        if not stack:
            return
        self.frames[idx] = stack.pop()
        # Keep the selection overlay visible but re-draw it over the restored frame
        self.update_frame_view()
        self.draw_selection()

    def copy_selection(self):
        if not self.select_mode or self.sel_box is None:
            return
        r0, c0, r1, c1 = self.sel_box
        frame = self.frames[self.current_frame_idx]
        self.clipboard = {(r - r0, c - c0): frame[r][c]
                          for r in range(r0, r1 + 1)
                          for c in range(c0, c1 + 1)}
        self.clipboard_size = (r1 - r0 + 1, c1 - c0 + 1)

    def paste_selection(self):
        if not self.select_mode or self.clipboard is None:
            return
        # Paste at same origin as copy; if it would go out of bounds, clip to (0,0)
        if self.sel_box:
            pr0, pc0 = self.sel_box[0], self.sel_box[1]
        else:
            pr0, pc0 = 0, 0
        h, w = self.clipboard_size
        # Clamp so paste stays in grid
        pr0 = min(pr0, ROWS - h)
        pc0 = min(pc0, COLS - w)
        self.push_history()
        frame = self.frames[self.current_frame_idx]
        for (dr, dc), color in self.clipboard.items():
            nr, nc = pr0 + dr, pc0 + dc
            if 0 <= nr < ROWS and 0 <= nc < COLS:
                frame[nr][nc] = color
                self.canvas.itemconfig(self.rects[nr][nc], fill=color)
        # Select the pasted region so it can be moved immediately
        self.sel_box = (pr0, pc0, pr0 + h - 1, pc0 + w - 1)
        self.sel_anchor = (pr0, pc0)
        self.draw_selection()

    def move_selection(self, dr, dc):
        if not self.select_mode or self.sel_box is None:
            return
        r0, c0, r1, c1 = self.sel_box
        nr0, nc0, nr1, nc1 = r0 + dr, c0 + dc, r1 + dr, c1 + dc
        if not (0 <= nr0 and nr1 < ROWS and 0 <= nc0 and nc1 < COLS):
            return
        self.push_history()
        frame = self.frames[self.current_frame_idx]
        # Snapshot colors inside the selection
        snapshot = {(r, c): frame[r][c] for r in range(r0, r1 + 1) for c in range(c0, c1 + 1)}
        # Clear old cells
        for (r, c) in snapshot:
            frame[r][c] = "#000000"
            self.canvas.itemconfig(self.rects[r][c], fill="#000000")
        # Paint at new positions
        for (r, c), color in snapshot.items():
            nr, nc = r + dr, c + dc
            frame[nr][nc] = color
            self.canvas.itemconfig(self.rects[nr][nc], fill=color)
        self.sel_box = (nr0, nc0, nr1, nc1)
        if self.sel_anchor:
            ar, ac = self.sel_anchor
            self.sel_anchor = (ar + dr, ac + dc)
        self.draw_selection()

    # ------------------------------------------------------------------ tools
    def set_tool(self, name):
        self.current_tool = name
        for tname, btn in self.tool_btns.items():
            if tname == name:
                btn.config(relief="sunken", bg="#2980b9", fg="white")
            else:
                btn.config(relief="raised", bg="#bdc3c7", fg="black")

    def bucket_fill(self, r, c):
        frame = self.frames[self.current_frame_idx]
        target = frame[r][c]
        fill = self.selected_color
        if target == fill:
            return
        self.push_history()
        stack = [(r, c)]
        visited = set()
        while stack:
            cr, cc = stack.pop()
            if (cr, cc) in visited:
                continue
            if not (0 <= cr < ROWS and 0 <= cc < COLS):
                continue
            if frame[cr][cc] != target:
                continue
            visited.add((cr, cc))
            frame[cr][cc] = fill
            self.canvas.itemconfig(self.rects[cr][cc], fill=fill)
            stack += [(cr+1, cc), (cr-1, cc), (cr, cc+1), (cr, cc-1)]

    # ------------------------------------------------------------------ shape drawing
    def _clear_shape_preview(self):
        for item in self.shape_preview_items:
            self.canvas.delete(item)
        self.shape_preview_items = []

    def _preview_shape(self, anchor, end_cell):
        self._clear_shape_preview()
        r0 = min(anchor[0], end_cell[0]); c0 = min(anchor[1], end_cell[1])
        r1 = max(anchor[0], end_cell[0]); c1 = max(anchor[1], end_cell[1])
        for (r, c) in self._get_shape_cells(r0, c0, r1, c1):
            if 0 <= r < ROWS and 0 <= c < COLS:
                x1 = c * PIXEL_SIZE + OFFSET; y1 = r * PIXEL_SIZE + OFFSET
                self.shape_preview_items.append(
                    self.canvas.create_rectangle(x1, y1, x1+PIXEL_SIZE, y1+PIXEL_SIZE,
                                                 fill=self.selected_color, outline="#FFFFFF", width=1)
                )

    def _commit_shape(self, anchor, end_cell):
        self._clear_shape_preview()
        r0 = min(anchor[0], end_cell[0]); c0 = min(anchor[1], end_cell[1])
        r1 = max(anchor[0], end_cell[0]); c1 = max(anchor[1], end_cell[1])
        self.push_history()
        frame = self.frames[self.current_frame_idx]
        for (r, c) in self._get_shape_cells(r0, c0, r1, c1):
            if 0 <= r < ROWS and 0 <= c < COLS:
                frame[r][c] = self.selected_color
                self.canvas.itemconfig(self.rects[r][c], fill=self.selected_color)

    def _get_shape_cells(self, r0, c0, r1, c1):
        filled = self.shape_fill.get()
        if self.current_tool == "rect":
            return self._cells_rect(r0, c0, r1, c1, filled)
        if self.current_tool == "circle":
            return self._cells_circle(r0, c0, r1, c1, filled)
        if self.current_tool == "tri":
            return self._cells_triangle(r0, c0, r1, c1, filled)
        return set()

    def _cells_rect(self, r0, c0, r1, c1, filled):
        cells = set()
        if filled:
            for r in range(r0, r1+1):
                for c in range(c0, c1+1):
                    cells.add((r, c))
        else:
            for c in range(c0, c1+1):
                cells.add((r0, c)); cells.add((r1, c))
            for r in range(r0+1, r1):
                cells.add((r, c0)); cells.add((r, c1))
        return cells

    def _cells_circle(self, r0, c0, r1, c1, filled):
        cells = set()
        cr = (r0 + r1) / 2.0; cc = (c0 + c1) / 2.0
        rx = (c1 - c0) / 2.0; ry = (r1 - r0) / 2.0
        if rx < 0.5 or ry < 0.5:
            cells.add((r0, c0)); return cells
        if filled:
            for r in range(r0, r1+1):
                for c in range(c0, c1+1):
                    if ((c-cc)/rx)**2 + ((r-cr)/ry)**2 <= 1.0:
                        cells.add((r, c))
        else:
            steps = max(int(2 * math.pi * max(rx, ry) * 2), 8)
            for i in range(steps):
                a = 2 * math.pi * i / steps
                cells.add((int(round(cr + ry*math.sin(a))),
                            int(round(cc + rx*math.cos(a)))))
        return cells

    def _line_cells(self, r0, c0, r1, c1):
        cells = set()
        dr = abs(r1-r0); dc = abs(c1-c0)
        sr = 1 if r1>r0 else -1; sc = 1 if c1>c0 else -1
        err = dr - dc; r, c = r0, c0
        while True:
            cells.add((r, c))
            if r == r1 and c == c1: break
            e2 = 2*err
            if e2 > -dc: err -= dc; r += sr
            if e2 <  dr: err += dr; c += sc
        return cells

    def _cells_triangle(self, r0, c0, r1, c1, filled):
        apex = (r0, (c0+c1)//2)
        bl = (r1, c0); br = (r1, c1)
        outline = (self._line_cells(*apex, *bl) |
                   self._line_cells(*apex, *br) |
                   self._line_cells(*bl,   *br))
        if not filled:
            return outline
        cells = set()
        for r in range(r0, r1+1):
            cols = [c for (rr, c) in outline if rr == r]
            if cols:
                for c in range(min(cols), max(cols)+1):
                    cells.add((r, c))
        return cells

    def paint(self, event):
        c, r = (event.x - OFFSET) // PIXEL_SIZE, (event.y - OFFSET) // PIXEL_SIZE
        if 0 <= r < ROWS and 0 <= c < COLS:
            self.frames[self.current_frame_idx][r][c] = self.selected_color
            self.canvas.itemconfig(self.rects[r][c], fill=self.selected_color)

    def erase(self, event):
        c, r = (event.x - OFFSET) // PIXEL_SIZE, (event.y - OFFSET) // PIXEL_SIZE
        if 0 <= r < ROWS and 0 <= c < COLS:
            self.push_history()
            self.frames[self.current_frame_idx][r][c] = "#000000"
            self.canvas.itemconfig(self.rects[r][c], fill="#000000")

    def update_frame_view(self):
        self.frame_label.config(text=f"Frame: {self.current_frame_idx + 1} / {len(self.frames)}")
        current_data = self.frames[self.current_frame_idx]
        for r in range(ROWS):
            for c in range(COLS):
                self.canvas.itemconfig(self.rects[r][c], fill=current_data[r][c])

    def next_frame(self):
        if self.current_frame_idx < len(self.frames) - 1:
            self.current_frame_idx += 1
        else:
            self.frames.append([["#000000" for _ in range(COLS)] for _ in range(ROWS)])
            self.current_frame_idx += 1
        self.update_frame_view()

    def prev_frame(self):
        if self.current_frame_idx > 0:
            self.current_frame_idx -= 1
            self.update_frame_view()

    def clone_specific_frame(self):
        try:
            source_idx = int(self.clone_idx_var.get()) - 1
            if 0 <= source_idx < len(self.frames):
                new_frame = [row[:] for row in self.frames[source_idx]]
                self.frames.insert(self.current_frame_idx + 1, new_frame)
                self.current_frame_idx += 1
                self.update_frame_view()
        except: pass

    def delete_frame(self):
        if len(self.frames) > 1:
            self.frames.pop(self.current_frame_idx)
            self.current_frame_idx = min(self.current_frame_idx, len(self.frames)-1)
            self.update_frame_view()

    def on_closing(self):
        if messagebox.askyesno("Confirm Exit", "Save project before closing?"):
            self.save_project()
        self.root.destroy()

    def save_project(self):
        path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("Project File", "*.json")])
        if path:
            with open(path, "w") as f:
                json.dump({"frames": self.frames, "palette": self.palette_colors, "speed": self.anim_speed.get()}, f)

    def load_project(self):
        path = filedialog.askopenfilename(filetypes=[("Project File", "*.json")])
        if path:
            with open(path, "r") as f:
                data = json.load(f)
                self.frames, self.palette_colors = data["frames"], data["palette"]
                if "speed" in data: self.anim_speed.set(data["speed"])
                # Update palette UI to match loaded project
                for i, color in enumerate(self.palette_colors):
                    self.palette_widgets[i].config(bg=color)
            self.current_frame_idx = 0
            self.update_frame_view()

    def export_to_file(self):
        path = filedialog.asksaveasfilename(defaultextension=".h", filetypes=[("Arduino Header", "*.h")])
        if not path: return
        name = path.split("/")[-1].replace(".h", "").replace(" ", "_")
        with open(path, "w") as f:
            f.write(f"#include <pgmspace.h>\nconst int {name}_delay = {self.anim_speed.get()};\n")
            for i, fr in enumerate(self.frames):
                f.write(f"const uint16_t {name}{i+1}[] PROGMEM = {{\n")
                for r in range(ROWS):
                    row = [f"0x{self.rgb_to_565(fr[r][c]):04X}" for c in range(COLS)]
                    f.write("  " + ", ".join(row) + ",\n")
                f.write("};\n\n")
            f.write(f"const uint16_t* const {name}_anim[] PROGMEM = {{"+", ".join([f"{name}{i+1}" for i in range(len(self.frames))])+"};\n")
            f.write(f"const int {name}_frame_count = {len(self.frames)};\n")

    def rgb_to_565(self, hex_color):
        h = hex_color.lstrip('#')
        r, g, b = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
        return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)

if __name__ == "__main__":
    root = tk.Tk()
    app = AnimatedPixelArtCreator(root)
    root.mainloop()