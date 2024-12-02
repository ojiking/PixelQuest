from flask import Flask, render_template, request, send_file, url_for
from PIL import Image, ImageDraw, ImageOps
import io

app = Flask(__name__)

# 기본 경로('/')를 처리하여 HTML 반환
@app.route('/')
def home():
    return render_template('index.html')  # HTML 파일 연결

# 색상 조정 함수
def apply_color_filter(image, filter_type):
    if filter_type == "grayscale":
        return ImageOps.grayscale(image)  # 회색조 처리
    elif filter_type == "sepia":
        sepia_image = ImageOps.colorize(ImageOps.grayscale(image), "#704214", "#C0A080")
        return sepia_image
    elif filter_type == "palette":
        # 단순화된 색상 팔레트 (16색)
        image = image.convert("P", palette=Image.ADAPTIVE, colors=16).convert("RGB")
        return image
    elif filter_type == "256colors":
        # 256컬러 팔레트
        image = image.convert("P", palette=Image.ADAPTIVE, colors=256).convert("RGB")
        return image
    elif filter_type == "8bit_green":
        # 8단계 명도로 조정 후 그린 모노크롬 스타일
        grayscale = ImageOps.grayscale(image)  # 회색조 변환
        # 명도 단계를 8단계로 제한
        def quantize(value, levels):
            return int(value / 256 * levels) * (256 // levels)
        grayscale = grayscale.point(lambda p: quantize(p, 8))  # 8단계 명도로 제한
        green_tone = ImageOps.colorize(grayscale, "#003300", "#00FF00")  # 어두운 초록 -> 밝은 초록
        return green_tone
    return image  # 기본: 원본 색상 유지


# 픽셀화 함수
def pixelate(image, pixel_size, gap, shape="square", filter_type="original"):
    # 이미지 축소 및 확대
    img = image.resize((image.width // pixel_size, image.height // pixel_size), Image.NEAREST)
    img = img.resize((image.width, image.height), Image.NEAREST)
    
    # 결과 이미지 준비 (흰색 배경 추가)
    overlay = Image.new("RGBA", img.size, (255, 255, 255, 255))  # 흰색 배경
    draw = ImageDraw.Draw(overlay)
    
    # 픽셀 모양 그리기
    for x in range(0, img.width, pixel_size + gap):
        for y in range(0, img.height, pixel_size + gap):
            color = img.getpixel((x, y))  # 현재 픽셀의 색상 가져오기
            
            if shape == "circle":
                # 원 그리기
                draw.ellipse(
                    [(x, y), (x + pixel_size, y + pixel_size)],
                    fill=color
                )
            elif shape == "diamond":
                # 다이아몬드 그리기 (중심을 기준으로 다각형)
                draw.polygon(
                    [
                        (x + pixel_size // 2, y),  # 위쪽 꼭짓점
                        (x, y + pixel_size // 2),  # 왼쪽 꼭짓점
                        (x + pixel_size // 2, y + pixel_size),  # 아래쪽 꼭짓점
                        (x + pixel_size, y + pixel_size // 2)  # 오른쪽 꼭짓점
                    ],
                    fill=color
                )
            else:
                # 기본 모양: 사각형 그리기
                draw.rectangle(
                    [(x, y), (x + pixel_size, y + pixel_size)],
                    fill=color
                )
    
    # 최종 색상 필터 적용
    img = Image.alpha_composite(img.convert("RGBA"), overlay)
    img = apply_color_filter(img.convert("RGB"), filter_type)
    return img

# '/process' 엔드포인트에서 이미지 처리
@app.route('/process', methods=['POST'])
def process_image():
    file = request.files.get('image')
    if not file:
        return "No file uploaded", 400

    pixel_size = int(request.form.get('pixel_size', 10))
    gap = int(request.form.get('gap', 0))
    shape = request.form.get('shape', 'square')
    color_filter = request.form.get('color_filter', 'original')

    img = Image.open(file)
    result = pixelate(img, pixel_size, gap, shape, color_filter)

    output = io.BytesIO()
    result.save(output, format='PNG')
    output.seek(0)
    return send_file(output, mimetype='image/png')

if __name__ == '__main__':
    app.run(debug=True)
