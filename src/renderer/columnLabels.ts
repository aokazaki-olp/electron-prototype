/**
 * columnLabels.ts
 * @description gBizINFO API レスポンスフィールド名 → 日本語ラベルのマッピング。
 *              Swagger 定義（github.com/nisyuu/gbizinfo docs/）を参照して作成。
 *              未登録のフィールドは toColumnLabel() がフィールド名をそのまま返す。
 */

export const COLUMN_LABELS: Readonly<Record<string, string>> = {

  // ── レスポンスラッパー ───────────────────────────────────────────
  'hojin-infos':   '法人情報',
  id:              'リクエストID',
  message:         'メッセージ',
  page_number:     'ページ番号',
  total_count:     '総件数',
  total_page:      '総ページ数',
  errors:          'エラー情報',

  // ── 法人基本情報（HojinInfo） ────────────────────────────────────
  corporate_number:        '法人番号',
  name:                    '法人名',
  name_en:                 '法人名（英語）',
  kana:                    '法人名フリガナ',
  status:                  'ステータス',
  update_date:             '最終更新日',
  location:                '本社所在地',
  postal_code:             '郵便番号',
  representative_name:     '法人代表者名',
  representative_position: '法人代表者役職',
  capital_stock:           '資本金',
  employee_number:         '従業員数',
  company_size_male:       '企業規模詳細（男）',
  company_size_female:     '企業規模詳細（女）',
  founding_year:           '創業年',
  date_of_establishment:   '設立年月日',
  close_date:              '登記記録の閉鎖等年月日',
  close_cause:             '登記記録の閉鎖等の事由',
  business_summary:        '事業概要',
  company_url:             '企業ホームページ',
  business_items:          '全省庁統一資格の営業品目',
  qualification_grade:     '全省庁統一資格の資格等級',
  number_of_activity:      '法人活動情報件数',
  // サブリソース参照キー
  certification:           '届出・認定情報',
  commendation:            '表彰情報',
  finance:                 '財務情報',
  patent:                  '特許情報',
  procurement:             '調達情報',
  subsidy:                 '補助金情報',
  workplace:               '職場情報',
  workplace_info:          '職場情報',

  // ── 認定情報（CertificationInfo） ───────────────────────────────
  title:               'タイトル',
  government_departments: '府省',
  category:            '部門',
  target:              '対象',
  enterprise_scale:    '企業規模',
  date_of_approval:    '認定日',
  expiration_date:     '有効期限',

  // ── 表彰情報（CommendationInfo）──── title / government_departments / category / target は共通
  date_of_commendation: '表彰年月日',

  // ── 特許情報（PatentInfo） ───────────────────────────────────────
  application_number:  '出願番号',
  application_date:    '出願年月日',
  patent_type:         '特許種別',
  classifications:     '分類',

  // ── 調達情報（ProcurementInfo） ─────────────────────────────────
  date_of_order:       '受注日',
  amount:              '金額',
  joint_signatures:    '連名',

  // ── 補助金情報（SubsidyInfo） ────────────────────────────────────
  subsidy_resource:    '補助金財源',
  note:                '備考',

  // ── 財務情報（Finance / ManagementIndex） ────────────────────────
  accounting_standards:    '会計基準',
  fiscal_year_cover_page:  '期',
  management_index:        '財務指標',
  major_shareholders:      '大株主',
  period:                  '回次',
  name_major_shareholders: '企業名もしくは出資者',
  shareholding_ratio:      '出資比率',
  net_sales_summary_of_business_results:                          '売上高',
  net_sales_summary_of_business_results_unit_ref:                 '売上高（単位）',
  gross_operating_revenue_summary_of_business_results:            '営業総収入',
  gross_operating_revenue_summary_of_business_results_unit_ref:   '営業総収入（単位）',
  operating_revenue1_summary_of_business_results:                 '営業収益',
  operating_revenue1_summary_of_business_results_unit_ref:        '営業収益（単位）',
  operating_revenue2_summary_of_business_results:                 '営業収入',
  operating_revenue2_summary_of_business_results_unit_ref:        '営業収入（単位）',
  ordinary_income_summary_of_business_results:                    '経常収益',
  ordinary_income_summary_of_business_results_unit_ref:           '経常収益（単位）',
  ordinary_income_loss_summary_of_business_results:               '経常利益又は経常損失(△)',
  ordinary_income_loss_summary_of_business_results_unit_ref:      '経常利益又は経常損失(△)（単位）',
  net_income_loss_summary_of_business_results:                    '当期純利益又は当期純損失(△)',
  net_income_loss_summary_of_business_results_unit_ref:           '当期純利益又は当期純損失(△)（単位）',
  net_assets_summary_of_business_results:                         '純資産額',
  net_assets_summary_of_business_results_unit_ref:                '純資産額（単位）',
  total_assets_summary_of_business_results:                       '総資産額',
  total_assets_summary_of_business_results_unit_ref:              '総資産額（単位）',
  capital_stock_summary_of_business_results:                      '資本金（財務）',
  capital_stock_summary_of_business_results_unit_ref:             '資本金（財務・単位）',
  net_premiums_written_summary_of_business_results_ins:           '正味収入保険料',
  net_premiums_written_summary_of_business_results_ins_unit_ref:  '正味収入保険料（単位）',
  number_of_employees:          '従業員数（財務）',
  number_of_employees_unit_ref: '従業員数（財務・単位）',

  // ── 職場情報（WorkplaceInfo） ────────────────────────────────────
  base_infos:                          '職場の基本情報',
  compatibility_of_childcare_and_work: '仕事と育児の両立',
  women_activity_infos:                '女性活躍情報',
  // WorkplaceBaseInfos
  average_age:                              '従業員の平均年齢',
  average_continuous_service_years:         '正社員の平均継続勤務年数',
  average_continuous_service_years_female:  '平均継続勤務年数（女性）',
  average_continuous_service_years_male:    '平均継続勤務年数（男性）',
  average_continuous_service_years_type:    '平均継続勤務年数種別',
  month_average_predetermined_overtime_hours: '月平均所定外労働時間',
  // WomenActivityInfos
  female_workers_proportion:      '女性労働者の割合',
  female_workers_proportion_type: '女性労働者の割合種別',
  female_share_of_manager:        '女性管理職人数',
  female_share_of_officers:       '女性役員人数',
  gender_total_of_manager:        '管理職に占める女性の割合',
  gender_total_of_officers:       '役員全体人数（男女計）',
  // CompatibilityOfChildcareAndWork
  maternity_leave_acquisition_num: '育児休業取得者数（女性）',
  number_of_maternity_leave:       '育児休業対象者数（女性）',
  number_of_paternity_leave:       '育児休業対象者数（男性）',
  paternity_leave_acquisition_num: '育児休業取得者数（男性）',
};

/**
 * フィールド名を日本語ラベルに変換する。マッピングにない場合はフィールド名をそのまま返す。
 *
 * @param key - API レスポンスのフィールド名
 * @returns 日本語ラベル、またはフィールド名そのもの
 */
export const toColumnLabel = (key: string): string => COLUMN_LABELS[key] ?? key;
