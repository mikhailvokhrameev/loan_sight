import os
import requests

def download_file(url, dest):
    if not os.path.exists(dest):
        print(f"Downloading {dest}...")
        response = requests.get(url)
        with open(dest, 'wb') as f:
            f.write(response.content)

download_file("https://drive.google.com/file/d/1CH7JFZobgFtQjOVuKgb1ew6ornfYjYwv/view?usp=sharing", "ml_models/model.txt")
download_file("https://drive.google.com/file/d/1JEbEKYiy6CegSq1TV9GlrUBKyW_jNYA5/view?usp=sharing", "ml_models/test_features.parquet")