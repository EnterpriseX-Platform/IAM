# Image Assets for IAMX Login Page

## Required Images:

### 1. Login Background Image
- **Filename:** `login-background.jpg` (or `.png`)
- **Location:** Place in this folder (`/public/images/`)
- **Recommended size:** 1920x1080px or larger
- **Format:** JPG or PNG
- **Purpose:** Background image for the login page

### 2. Website Logo
- **Filename:** `logo.png`
- **Location:** Place in this folder (`/public/images/`)
- **Recommended size:** 256x256px (square)
- **Format:** PNG (with transparent background recommended)
- **Display size:** Will be displayed at 64x64px
- **Purpose:** Main logo shown on login page and throughout the site

## How to Add Images:

1. Prepare your images with the specifications above
2. Rename them to match the filenames exactly:
   - `login-background.jpg` (or `.png`)
   - `logo.png`
3. Copy both files to this directory: `D:\iamx\web\public\images\`
4. Restart the Next.js development server to see changes

## Customization Options:

### Adjust Background Overlay
If you want to adjust the background image overlay effect, edit line ~110 in `/web/app/login/page.tsx`:

```tsx
{/* Current overlay: white with 30% opacity and 2px blur */}
<div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]" />

{/* Examples of other overlay styles: */}
{/* Darker overlay: */}
<div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

{/* More blur: */}
<div className="absolute inset-0 bg-white/30 backdrop-blur-md" />

{/* No overlay at all: */}
<div className="absolute inset-0" />
```

### Change Image Format
If you want to use a different image format for the background (e.g., `.png` instead of `.jpg`), update line ~108 in `/web/app/login/page.tsx`:

```tsx
<Image
  src="/images/login-background.png"  {/* Change extension here */}
  alt="Login Background"
  fill
  className="object-cover"
  priority
  quality={100}
/>
```

### Adjust Logo Size
To change the logo display size, edit line ~126 in `/web/app/login/page.tsx`:

```tsx
<div className="mx-auto mb-4 flex h-20 w-20 ...">  {/* Change h-20 w-20 */}
  <Image
    src="/images/logo.png"
    alt="IAMX Logo"
    width={64}  {/* Change width */}
    height={64} {/* Change height */}
    ...
  />
</div>
```

## Next.js Image Optimization

Next.js automatically optimizes images for better performance. The images you place here will be:
- Automatically resized for different screen sizes
- Converted to modern formats (WebP) when supported
- Lazy-loaded (except when `priority` is set)
- Served with optimal caching headers

No additional configuration needed!
