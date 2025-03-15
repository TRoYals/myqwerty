import json
import os

def process_dictionary(file_path):
    try:
        # 检查文件是否存在
        if not os.path.exists(file_path):
            return {"error": f"文件不存在: {file_path}"}
        
        # 读取JSON文件
        with open(file_path, 'r', encoding='utf-8') as file:
            try:
                word_list = json.load(file)
            except json.JSONDecodeError:
                return {"error": "JSON格式错误，无法解析文件"}
        
        # 1. 删除重复出现的"name"词条
        unique_names = {}
        for word in word_list:
            if word['name'] not in unique_names:
                unique_names[word['name']] = word
        
        # 转换回列表
        unique_word_list = list(unique_names.values())
        
        # 2. 按照ukphone排列
        try:
            sorted_word_list = sorted(unique_word_list, key=lambda x: int(x['ukphone']))
        except (ValueError, KeyError) as e:
            return {"error": f"排序时出错，可能是ukphone字段格式不正确: {str(e)}"}
        
        # 3. 计算词条数目
        total_entries = len(sorted_word_list)
        
        # 4. 检查是否有大于10页的内容没有单词
        try:
            # 创建一个集合来存储所有存在的ukphone值
            existing_ukphones = set(int(word['ukphone']) for word in sorted_word_list)
            
            # 如果没有词条，返回空结果
            if not existing_ukphones:
                return {
                    "total_entries": 0,
                    "missing_ranges": []
                }
            
            # 找出缺失的ukphone值范围
            missing_ranges = []
            current_range_start = None
            
            # 获取最小和最大的ukphone值
            min_ukphone = min(existing_ukphones)
            max_ukphone = max(existing_ukphones)
            
            for ukphone in range(min_ukphone, max_ukphone + 1):
                if ukphone not in existing_ukphones:
                    if current_range_start is None:
                        current_range_start = ukphone
                else:
                    if current_range_start is not None:
                        missing_range_length = ukphone - current_range_start
                        if missing_range_length > 10:
                            missing_ranges.append((current_range_start, ukphone - 1))
                        current_range_start = None
            
            # 检查最后一个范围
            if current_range_start is not None:
                missing_range_length = max_ukphone + 1 - current_range_start
                if missing_range_length > 10:
                    missing_ranges.append((current_range_start, max_ukphone))
        except Exception as e:
            return {"error": f"检查缺失范围时出错: {str(e)}"}
        
        # 保存处理后的结果
        try:
            output_path = os.path.join(os.path.dirname(file_path), 'processed_dictionary.json')
            with open(output_path, 'w', encoding='utf-8') as file:
                json.dump(sorted_word_list, file, ensure_ascii=False, indent=4)
            print(f"处理后的文件已保存到: {output_path}")
        except Exception as e:
            return {"error": f"保存结果时出错: {str(e)}"}
        
        return {
            "total_entries": total_entries,
            "missing_ranges": missing_ranges
        }
    
    except Exception as e:
        return {"error": f"处理过程中出现未预期的错误: {str(e)}"}

# 使用示例
if __name__ == "__main__":
    # 使用正确的路径格式
    default_file_path = r"C:\Users\tsugumi\Documents\vscode\myqwerty\public\dicts\0book_zenAndMotorbike.json"
     
    # 检查命令行参数
    import sys
    if len(sys.argv) > 1:
        default_file_path = sys.argv[1]
    
    print(f"正在处理文件: {default_file_path}")
    result = process_dictionary(default_file_path)
    
    if 'error' in result:
        print(f"处理过程中出错: {result['error']}")
    else:
        print(f"词典总条目数: {result['total_entries']}")
        
        if result['missing_ranges']:
            print("以下页码范围缺失超过10页的内容:")
            for start, end in result['missing_ranges']:
                print(f"  从页码 {start} 到 {end}")
        else:
            print("没有发现超过10页的内容缺失")